<?php

// Validation function that ensures all assembly names passed into this page are safe
function valid_assembly_name($name) {
  return !!preg_match('/[A-Za-z0-9_-]/', $name);
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


// From a `nodes` array in a `.heatmap.json` file, extract isolate data for only the assemblies
// specified by $assembly_names
function get_isolate_data($nodes, $assembly_names) {
  $isolate_data = array();
  $keys = null;
  if (!key_exists("name", $nodes[0])) {
    // $nodes is in tabular form.
    $keys = array_shift($nodes);
  }
  foreach($nodes as $node) {
    if ($keys !== null) { $node = array_combine($keys, $node); }
    if (array_search($node["name"], $assembly_names) !== false) {
      $isolate_data[$node["name"]] = $node;
    }
  }
  return $isolate_data;
}


// Processes all the $_GET query variables for the dendro-timeline.php page
// If an error occurs, $error is set to the error message
function parse_query_string($REQ) {
  $db = null;
  $assembly_names = null;
  $isolates = null;
  $matching_tree = null;
  $error = null;
  
  if (isset($REQ['db'])) {
    $db = preg_replace('/[^\w.-]/i', '', $REQ['db']);
    $json = json_decode(@file_get_contents(dirname(dirname(__FILE__)). "/data/$db.heatmap.json"), true);
  }
  
  if (isset($json) && $json && is_array($json["trees"])) {
    $assembly_names = isset($REQ['assemblies']) ? array_filter(explode(' ', $REQ['assemblies']), 'valid_assembly_name') : null;
    if (!$assembly_names || !count($assembly_names)) { 
      $error = "No valid assembly names were given in the `assemblies` parameter";
    } else {
      $isolates = get_isolate_data($json["nodes"], $assembly_names);
      foreach ($json["trees"] as $tree) {
        $num_matches = 0;
        foreach ($assembly_names as $assembly_name) {
          $num_matches += preg_match('/[(,]' . preg_quote($assembly_name, '/') . '[:,]/', $tree);
        }
        if ($num_matches == count($assembly_names)) {
          $matching_tree = $tree;
          break;
        }
      }
    }
  } else { $error = "Could not load valid JSON from `db`. Is there a matching `.heatmap.json` file in `data/`?"; }
  
  return array($db, $assembly_names, $isolates, $matching_tree, $error);
}