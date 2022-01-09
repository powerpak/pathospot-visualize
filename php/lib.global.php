<?php

function get_data_dir($full_path = TRUE) {
  $data_dir = isset($_SERVER['PATHOSPOT_DATA_DIR']) ? $_SERVER['PATHOSPOT_DATA_DIR'] : 'data';
  return ($full_path ? dirname(dirname(__FILE__)) . "/" : "") . "$data_dir/";
}

function redirect_short_urls($mrsa_db = '') {
  $SHORT_URLS = array(
    '2' => 'heatmap.php?db={{}}&filter=clustersOnly&snps=15&range=0.0|1.0',
    '3' => 'dendro-timeline.php?db={{}}&assemblies=S_aureus_ER09654_3A_026146%20S_aureus_ER11693_3A_027097%20S_aureus_ER11501_3A_026953%20S_aureus_ER11761_3A_027108%20S_aureus_ER07227_3A_025296%20S_aureus_ER05786_3A_024918%20S_aureus_ER05686_3A_023855%20S_aureus_ER05682_3A_023854%20S_aureus_PS00099_3A_024679%20S_aureus_ER07103_3A_025066%20S_aureus_ER07191_3A_025295%20S_aureus_ER07131_3A_025294%20S_aureus_ER05686_5A_025756%20S_aureus_ER05353_3A_023850%20S_aureus_ER05508_3A_024907%20S_aureus_ER05526_3A_024910%20S_aureus_ER05891_3A_025759%20S_aureus_ER06446_3A_024926%20S_aureus_ER06037_3A_025806%20S_aureus_ER05368_3A_023852%20S_aureus_ER05866_3A_025757%20S_aureus_ER05682_5A_025755%20S_aureus_ER09911_3A_026327%20S_aureus_ER07970_3C_026528&colorNodes=collection_unit&filter=inpatient&timelineGrouping=0&isolateTests=seq-and-same-species&variantLabels=gene&variantNtOrAa=nt&showOverlaps=1&tolerance=12&sort=(%270!(%272AD10BD34B5-40C5-77*3D142A7-176C3-181B9-399A5-459C9-476A9-574C7-593B3-628B7-648CD669A22.5%27))*!%270000000-0%27~A*2B*1C*0D1-%01DCBA-*',
    'S3B' => 'dendro-timeline.php?db={{}}&assemblies=S_aureus_ER10871_3A_026677%20S_aureus_ER05215_3A_023863%20S_aureus_ER05295_3A_024902&colorNodes=ordered&filter=&timelineGrouping=0&isolateTests=&variantLabels=gene&variantNtOrAa=nt&showOverlaps=1&tolerance=12&sort=()',
    'S1' => 'heatmap.php?db={{}}&filter=mergeSamePt&snps=15&order=groupOrder&range=0%7C0.15&mode=network&play=1'
  );
  
  if (isset($_GET['fig']) && $_GET['fig'] !== '' && $mrsa_db && isset($SHORT_URLS[$_GET['fig']])) {
    $url = str_replace('{{}}', $mrsa_db, $SHORT_URLS[$_GET['fig']]);
    header("Location: $url", true, 301);
    exit();
  }
}