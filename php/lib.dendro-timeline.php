<?php


// Validation function that ensures all assembly names passed into this page are safe
function valid_assembly_name($name) {
  return !!preg_match('/[A-Za-z0-9_-]/', $name);
}


// From a `nodes` array in a `.heatmap.json` file, extract isolate data for only the assemblies
// specified by $assembly_names
function get_isolate_data($nodes, $assembly_names=null) {
  $isolate_data = array();
  $keys = null;
  if (!key_exists("name", $nodes[0])) {
    // $nodes is in tabular form.
    $keys = array_shift($nodes);
  }
  foreach($nodes as $node) {
    if ($keys !== null) { $node = array_combine($keys, $node); }
    if ($assembly_names === null || array_search($node["name"], $assembly_names) !== false) {
      $isolate_data[$node["name"]] = $node;
    }
  }
  return $isolate_data;
}


// For a given array of `$trees` containing Newick-formatted trees, find the one that contains
// ALL of the `$assembly_names`. Both the tree itself and its index are returned.
// If no tree contained every single name in `$assembly_names`, nulls are returned.
// NOTE: `$assembly_names` can also be a single assembly name, as a string.
function find_matching_tree($trees, $assembly_names) {
  $assembly_names = is_array($assembly_names) ? $assembly_names : array($assembly_names);
  $matching_tree = null;
  foreach ($trees as $which_tree => $tree) {
    $num_matches = 0;
    foreach ($assembly_names as $assembly_name) {
      $num_matches += preg_match('/[(,]' . preg_quote($assembly_name, '/') . '[:,]/', $tree);
    }
    if ($num_matches == count($assembly_names)) {
      $matching_tree = $tree;
      break;
    }
  }
  return array($matching_tree, $matching_tree !== null ? $which_tree : null);
}


// Processes all the `$_GET` query variables for the `dendro-timeline.php` page and loads
// data from the `.heatmap.json` file into a list of returned variables
// If an error occurs, `$error` is set to the error message
function load_from_heatmap_json($REQ) {
  $db = null;
  $assembly_names = null;
  $isolates = null;
  $matching_tree = null;
  $error = null;
  
  if (isset($REQ['db'])) {
    $db = preg_replace('/[^\w.-]/i', '', $REQ['db']);
    $json = json_decode(@file_get_contents(dirname(dirname(__FILE__)) . "/data/$db.heatmap.json"), true);
  }
  
  if (isset($json) && $json && is_array($json["trees"])) {
    if (isset($REQ['assemblies'])) {
      // Assemblies already specified. Get data to show the dendro-timeline.
      $assembly_names = array_filter(explode(' ', $REQ['assemblies']), 'valid_assembly_name');
      if (!$assembly_names || !count($assembly_names)) {
        $error = "No valid assembly names were given in the `assemblies` parameter";
      } else {
        $isolates = get_isolate_data($json["nodes"], $assembly_names);
        list($matching_tree, $which_tree) = find_matching_tree($json["trees"], $assembly_names);
      }
      if (!$matching_tree) { $error = "Could not find a fully-linked tree that connects all the specified assemblies."; }
    } else {
      // Picking the assemblies. Get all isolate data.
      $assembly_select = isset($REQ['select']) ? array_filter(explode(' ', $REQ['select']), 'valid_assembly_name') : null;
      $isolates = get_isolate_data($json["nodes"]);
      // When picking the assemblies, `$which_tree` is a map of all assembly names to their tree (mash cluster) numbers
      $which_tree = array();
      foreach($isolates as $assembly_name => $isolate) {
        list($matching_tree, $tree_num) = find_matching_tree($json["trees"], $assembly_name);
        $which_tree[$assembly_name] = $tree_num;
      }
      return array($db, $assembly_select, $isolates, null, $which_tree, null);
    }
  } else { $error = "Could not load valid JSON from `db`. Is there a matching `.heatmap.json` file in `data/`?"; }
  
  return array($db, $assembly_names, $isolates, $matching_tree, $which_tree, $error);
}


// Prunes the Newick tree given as the first argument to a smaller tree only containing
// leaves named in the `$assembly_names` argument
// Uses the scripts/prune-newick.py script to do all processing, which requires
// Python and the `ete3` library 
function prune_tree($newick_tree, $assembly_names) {
  global $PYTHON;
  $descriptorspec = array(
     0 => array("pipe", "r"),  // stdin is a pipe that the child will read from
     1 => array("pipe", "w"),  // stdout is a pipe that the child will write to
     2 => array("pipe", "w")
  );
  
  $assembly_args = implode(' ', array_map('escapeshellarg', $assembly_names));
  $script = dirname(dirname(__FILE__)) . '/scripts/prune-newick.py';
  $process = proc_open("$PYTHON $script $assembly_args", $descriptorspec, $pipes);

  if (is_resource($process)) {
    fwrite($pipes[0], $newick_tree);
    fclose($pipes[0]);

    $pruned_tree = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[2]);

    $return_value = proc_close($process);
    if (!$return_value) {
      return $pruned_tree;
    }
  }
  return false;
}


// Loads the encounters.tsv data corresponding to the current `$db` parameter and
// filters it to only the encounters with eRAP_IDs corresponding to those in `$isolates`
function load_encounters_for_isolates($db, $isolates) {
  $eRAP_IDs = array();
  $tsv_header = null;
  $encounters = array();
  
  foreach ($isolates as $isolate) { $eRAP_IDs[$isolate["eRAP_ID"]] = true; }
  
  $fh = @fopen(dirname(dirname(__FILE__)) . "/data/" . preg_replace('/\.\w+$/', '', $db) . ".encounters.tsv", 'r');
  if ($fh === false) { return null; }
  while (($line = fgetcsv($fh, 0, "\t")) !== false) {
    if ($tsv_header === null) { 
      $tsv_header = $line; 
      $eRAP_ID_col = array_search("eRAP_ID", $tsv_header);
      array_push($encounters, $line);
    } else {
      if ($eRAP_ID_col !== false && isset($eRAP_IDs[$line[$eRAP_ID_col]])) {
        array_push($encounters, $line);
      }
    }
  }
  
  return $encounters;
}


// Loads the .npz data.
//     - get the indices of the columns corresponding to $assembly_names
//     - find the rows of the VCF that are *not* all equal across those columns. That can be done with:
//       `~np.all(vcf_mat[col_indices[0], :] == vcf_mat[col_indices, :], axis=0)`
//     - spit out just those rows' allele data, + the CHROM/POS/ALT + other annotations for those rows.
function variants_for_assemblies_as_json($db_or_npz, $which_tree, $assembly_names) {
  global $PYTHON;
  $descriptorspec = array(
     0 => array("pipe", "r"),  // stdin is a pipe that the child will read from
     1 => array("pipe", "w"),  // stdout is a pipe that the child will write to
     2 => array("pipe", "w")
  );
  
  $npz = preg_match('/\.vcfs\.npz$/', $db_or_npz) ? $db_or_npz : "{$db_or_npz}.vcfs.npz";
  $assembly_args = implode(' ', array_map('escapeshellarg', $assembly_names));
  $script = dirname(dirname(__FILE__)) . '/scripts/vcfs-npz-to-json.py';
  $process = proc_open("$PYTHON $script data/$npz $which_tree $assembly_args", $descriptorspec, $pipes);

  if (is_resource($process)) {
    fclose($pipes[0]);

    $json = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[2]);

    $return_value = proc_close($process);
    if (!$return_value) {
      return $json;
    }
  }
  return json_encode(array("error" => isset($stderr) ? $stderr : "Error running the Python interpreter."));
}



// Loads the .epi.heatmap.json data corresponding to the current `$db` parameter and
// filters it to only the data with eRAP_IDs corresponding to those in `$isolates`
function load_epi_for_isolates($db, $isolates) {
  $eRAP_IDs = array();
  $epi_filename = preg_replace('/\.\w+$/', '', $db) . ".epi.heatmap.json";
  $epi = array("isolate_test_results" => null);
  
  foreach ($isolates as $isolate) { $eRAP_IDs[$isolate["eRAP_ID"]] = true; }
  
  $epi_json = json_decode(@file_get_contents(dirname(dirname(__FILE__)) . "/data/$epi_filename"), true);
  if (isset($epi_json) && $epi_json && is_array($epi_json["isolate_test_results"])) {
    $eRAP_ID_col = array_search("eRAP_ID", $epi_json["isolate_test_results"][0]);
    $epi["isolate_test_results"] = array($epi_json["isolate_test_results"][0]);
    foreach($epi_json["isolate_test_results"] as $i => $row) {
      if ($i === 0) { continue; }
      if ($eRAP_IDs[$row[$eRAP_ID_col]]) {
        array_push($epi["isolate_test_results"], $row);
      }
    }
  }
  return $epi;
}