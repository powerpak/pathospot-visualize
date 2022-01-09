<!DOCTYPE html>
<html>
<?php
if (file_exists(dirname(__FILE__).'/php/include.php')) { require(dirname(__FILE__).'/php/include.php'); }
else { require(dirname(__FILE__).'/php/example.include.php'); }

require(dirname(__FILE__).'/php/lib.heatmap.php');

$data_dir = get_data_dir();
$data_files = array_reverse(glob($data_dir . '*.{snv,parsnp}.heatmap.json', GLOB_BRACE));
$epi_data_files = array_map('basename', array_reverse(glob($data_dir . '*.epi.heatmap.json')));

$selected_data_file = reset($data_files);
if (isset($_GET['db']) && in_array($data_dir . $_GET['db'] . ".heatmap.json", $data_files)) {
  $selected_data_file = $data_dir . $_GET['db'] . ".heatmap.json";
}
$snp_threshold = 10;

?>
<head>
  
<meta charset="utf-8" />
<title>pathoSPOT - Surveillance Isolates - Heatmap</title>
<link href="css/d3-tip.css" rel="stylesheet" />
<link href="css/ionicons.min.css" rel="stylesheet" />
<link href="css/rangeslider.css" rel="stylesheet" />
<link href="css/select2.css" rel="stylesheet" />
<link href="css/intro.css" rel="stylesheet" />
<link href="css/style.css" rel="stylesheet" />

<script src="js/underscore-min.js"></script>
<script src="js/jquery.min.js"></script>
<script src="js/d3.v4.min.js" charset="utf-8"></script>
<script src="js/d3-tip.js"></script>
<script src="js/rangeslider.min.js" charset="utf-8"></script>
<script src="js/select2.min.js" charset="utf-8"></script>
<script src="js/heatmap.min.js" charset="utf-8"></script>
<script src="js/FileSaver.js" charset="utf-8"></script>
<script src="js/utils.js"></script>
<script src="build/hclust.js" charset="utf-8"></script>
<script src="js/intro.js" charset="utf-8"></script>

<script>DATA_DIR = <?= json_encode(get_data_dir(FALSE)) ?>;</script>
<?php
if (file_exists(dirname(__FILE__).'/js/config.js')) { ?><script src="js/config.js" charset="utf-8"></script><?php }
else { ?><script src="js/example.config.js" charset="utf-8"></script><?php }
?>

<?php includeAfterHead(); ?>

</head>

<body class="pathospot-heatmap">
  
<?php includeBeforeBody(); ?>

<div class="loading">
  <div class="loading-dots"></div>
  <div class="loading-text">downloading data</div>
</div>
  
<div id="controls">
  <div class="toolbar">
    <label class="widget">
      <span class="widget-label">Dataset</span>
      <select id="db" name="db">
<?php 
foreach ($data_files as $data_file): 
  $meta = getHeatmapMetadata($data_file);
  $filename = basename(substr($data_file, 0, -13));
  $units = htmlspecialchars($meta['distance_unit']);
  if ($data_file === $selected_data_file && isset($meta['distance_threshold'])) {
    $snp_threshold = $meta['distance_threshold'];
  }
  $title = preg_replace('#\\..*#', '', $filename);
  $date = strftime('%b %d %Y', strtotime($meta['generated']));
  $epi_filename = "";
  foreach($epi_data_files as $file) { if (strpos($file, "$title.") === 0) { $epi_filename = $file; break; } }
  ?>
        <option value="<?= htmlspecialchars($filename) ?>" data-epi="<?= htmlspecialchars($epi_filename) ?>">
          <?= $title ?> <?= $units ?> – <?= $date ?>
        </option>
<?php endforeach ?>
      </select>
    </label>
    <label class="widget" id="snps-cont">
      <span class="widget-label">Similarity threshold</span>
      <input id="snps-num" name="snps_num" type="text" size="3" value="<?= $snp_threshold ?>" disabled />
      <span class="distance-unit units">parsnp SNPs</span>
      <input id="snps" name="snps" class="range" type="range" min="1" step="1" />
    </label>
    <div class="clear"></div>
    <label class="widget" id="filter-cont">
      <span class="widget-label">Merging &amp; prefiltering</span>
      <select id="filter" name="filter" class="select2" multiple="multiple">
        <optgroup label="General">
          <option value="mergeSamePt" selected>Merge similar specimens from same patient</option>
          <option value="clustersOnly">Only show putative transmissions (≥1 link to another patient)</option>
        </optgroup>
        <optgroup label="Filter by unit" id="units">
        </optgroup>
        <optgroup label="Filter by MLST" id="mlsts">
        </optgroup>
      </select>
    </label>
    <label class="widget" id="toggle-main">
      <a data-show="heatmap" class="toggle-btn toggle-btn-left active">Heatmap view</a>
      <a data-show="network" class="toggle-btn toggle-btn-right">Network map view</a>
    </label>
    <div class="clear"></div>
    <label class="widget" id="heatmap-order">
      <span class="widget-label">Order rows/columns</span>
      <select id="order">
        <option value="groupOrder">by clustering order</option>
        <option value="eRAP_ID">by Anonymized Patient ID</option>
        <option value="order_date">by Order Date</option>
        <option value="collection_unit">by Collection Unit</option>
        <option value="mlst_subtype">by MLST Subtype</option>
      </select>
    </label>
    <label id="cluster-legend" class="widget">
      <span class="num-clusters">N</span> clusters detected
      <a id="cluster-info"><svg height="24" width="18"></svg><i class="icon ion-md-help-circle"></i></a>
      <svg id="cluster-list" height="24" width="100"></svg>
      <a href="javascript:void(0)" id="download-clusters"
          title="Download a TSV of the currently detected clusters"><i class="icon ion-md-download"></i><span>TSV</span></a>
      <div id="max-cluster-size-warning" class="alert alert-danger">
        Your largest outbreak cluster is as big as the largest Mash precluster.
        Consider increasing <code>MAX_CLUSTER_SIZE</code>; 
        <a href="https://github.com/powerpak/pathospot-compare#rake-parsnp" target="_blank">see the documentation</a>
        for more details.
      </div>
    </label>
    <div class="clear"></div>
    <label class="widget"><span class="widget-label">Filter genomes by specimen order dates</span></label>
    <label class="widget" id="daterange-animate">
      <span class="widget widget-label">Animate</span>
      <a data-action="pause" class="toggle-btn mini toggle-btn-left active pause"
          title="Pause animation"><i class="icon ion-md-pause"></i></a>
      <a data-action="play" data-speed="0.01" class="toggle-btn mini"
          title="Start advancing the time window"><i class="icon ion-md-play"></i></a>
      <a data-action="play" data-speed="0.03" class="toggle-btn mini"
          title="Start advancing the time window, 3x speed"><i class="icon ion-md-play"></i><i class="icon ion-md-play"></i></a>
      <a data-action="playexpand" data-speed="0.01" class="toggle-btn mini"
          title="Start expanding the time window"><i class="icon ion-md-add"></i> <i class="icon ion-md-play"></i></a>
      <a data-action="playexpand" data-speed="0.03" class="toggle-btn mini toggle-btn-right"
          title="Start expanding the time window, 3x speed"><i class="icon ion-md-add"></i> <i class="icon ion-md-play"></i><i class="icon ion-md-play"></i></a>
    </label>
    <label id="histo-title">
      Histogram of
      <span class="distance-unit">distances</span>
      to closest previous genome
    </label>
  </div>
  <div class="clear"></div>
</div>

<div id="epi-heatmap" class="main-view network" style="display: none"><div class="cont"></div></div>

<div id="epi-controls" class="main-view network toolbar" style="display: none">
  <label class="widget">
    Collected isolates
    <div class="color-scale"><span class="min">0</span><span class="max"></span></div>
  </labeL>
  <label class="widget">
    <span class="widget-label">Gain</span>
    <input id="epi-heatmap-gain" class="range" type="range" min="0" max="2" step="0.025" value="1"/>
  </label>
  <label class="widget">
    <span class="widget-label">Opacity</span>
    <input id="epi-heatmap-opacity" class="range" type="range" min="0" max="1" step="0.01" value="0.5"/>
  </label>
  <label class="widget chk-label">
    <input id="network-show" type="checkbox" class="chk" checked />
    <span class="widget-label">Show genomic network</span>
  </label>
</div>

<script src="js/pathogendb.intro.js" charset="utf-8"></script>
<script src="js/pathogendb.heatmap.js"></script>

<?php includeAfterBody(); ?>

</body>
</html>