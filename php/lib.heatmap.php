<?php

// Reads the metadata we need from the specified $data_file, which is a path to a JSON file
// As a shortcut, tries to pull everything out of the first 1000 characters if possible,
// which avoids a potentially expensive `json_decode()`; will fall back to that if needed
// though.
function getHeatmapMetadata($data_file) {
  $meta = array();
  
  $fp = fopen($data_file, 'r');
  $head = fread($fp, 1000);
  fclose($fp);
  if (preg_match('#"generated"\\s*:\\s*"([^"]*)",#', $head, $matches)) {
    $meta['generated'] = $matches[1];
    if (preg_match('#"distance_unit"\\s*:\\s*"([^"]*)",#', $head, $matches)) {
      $meta['distance_unit'] = $matches[1];
      return $meta;
    }
  }
  
  return json_decode(file_get_contents($data_file), TRUE);
}