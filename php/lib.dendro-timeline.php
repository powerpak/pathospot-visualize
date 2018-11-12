<?php

function valid_isolate_id($isolate_id) {
  return !!preg_match('/[A-Za-z0-9_-]/', $isolate_id);
}

function prune_tree($matching_tree, $isolates) {
  global $PYTHON;
  $descriptorspec = array(
     0 => array("pipe", "r"),  // stdin is a pipe that the child will read from
     1 => array("pipe", "w"),  // stdout is a pipe that the child will write to
     2 => STDERR
  );
  
  $isolate_args = implode(' ', array_map('escapeshellarg', $isolates));
  $script = dirname(dirname(__FILE__)) . '/scripts/prune-newick.py';
  $process = proc_open("$PYTHON $script $isolate_args", $descriptorspec, $pipes);

  if (is_resource($process)) {
    fwrite($pipes[0], $matching_tree);
    fclose($pipes[0]);

    $pruned_tree = stream_get_contents($pipes[1]);
    fclose($pipes[1]);

    $return_value = proc_close($process);

    return $pruned_tree;
  }
  return false;
}