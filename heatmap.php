<!DOCTYPE html>
<html>
<?php
if (file_exists(dirname(__FILE__).'/php/include.php')) { require(dirname(__FILE__).'/php/include.php'); }
else { require(dirname(__FILE__).'/php/example.include.php'); }

$data_files = array_reverse(glob(dirname(__FILE__).'/data/*.heatmap.json'));
?>
<head>
  
<meta charset="utf-8" />
<title>Surveillance Isolates - Heatmap</title>
<link href="css/d3-tip.css" rel="stylesheet" />
<link href="css/rangeslider.css" rel="stylesheet" />
<link href="css/select2.css" rel="stylesheet" />
<link href="css/style.css" rel="stylesheet" />

<script src="js/underscore-min.js"></script>
<script src="js/jquery.min.js"></script>
<script src="js/d3.v4.min.js" charset="utf-8"></script>
<script src="js/d3-tip.js"></script>
<script src="js/rangeslider.min.js" charset="utf-8"></script>
<script src="js/select2.min.js" charset="utf-8"></script>
<script src="build/hclust.js" charset="utf-8"></script>
<?php
if (file_exists(dirname(__FILE__).'/js/config.js')) { ?><script src="js/config.js" charset="utf-8"></script><?php }
else { ?><script src="js/example.config.js" charset="utf-8"></script><?php }
?>

<?php includeAfterHead(); ?>

</head>

<body>
  
<?php includeBeforeBody(); ?>
  
<div id="controls">
  <div class="toolbar">
    <label class="widget">
      <span class="widget-label">Dataset</span>
      <select id="db" name="db">
<?php 
foreach ($data_files as $data_file): 
  $data = json_decode(file_get_contents($data_file), TRUE);
  $filename = basename(substr($data_file, 0, -13));
  $units = htmlspecialchars($data['distance_unit']);
  $title = preg_replace('#\\..*#', '', $filename);
  $date = strftime('%b %d %Y', strtotime($data['generated']));
  ?>
        <option value="<?= htmlspecialchars($filename) ?>"><?= $title ?> <?= $units ?> – <?= $date ?></option>
<?php endforeach ?>
      </select>
    </label>
    <label class="widget">
      <span class="widget-label">Similarity threshold</span>
      <input id="snps-num" name="snps_num" type="text" size="3" value="10" disabled />
      <span class="distance-unit units">SNPs</span>
      <input id="snps" name="snps" class="range" type="range" min="1" step="1"/>
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
    <label class="widget">
      <a data-show="heatmap" class="toggle-btn toggle-btn-left active">Heatmap view</a>
      <a data-show="network" class="toggle-btn toggle-btn-right">Network view</a>
    </label>
    <div class="clear"></div>
    <label class="widget">
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
      <span id="cluster-list"></span>
    </label>
    <div class="clear"></div>
    <label>Filter by specimen order dates</label>
    <label id="histo-title">
      Histogram of
      <span class="distance-unit">distances</span>
      to closest previous isolate
    </label>
  </div>
</div>

<script src="js/pathogendb.heatmap.js"></script>

<?php includeAfterBody(); ?>

</body>
</html>