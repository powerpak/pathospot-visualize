<?php

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