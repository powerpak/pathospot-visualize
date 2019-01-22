<!DOCTYPE html>
<html>
<?php
if (file_exists(dirname(__FILE__).'/php/include.php')) { require(dirname(__FILE__).'/php/include.php'); }
else { require(dirname(__FILE__).'/php/example.include.php'); }

require(dirname(__FILE__).'/php/lib.dendro-timeline.php');

list($db, $assembly_names, $isolates, $matching_tree, $error) = load_from_heatmap_json($_GET);

if (!$error) {
  if ($matching_tree) { $pruned_tree = prune_tree($matching_tree, $assembly_names); }
  if (!$pruned_tree) { $error = "Error running `scripts/prune-newick.py`; is \$PYTHON (with ete3 installed) configured in `php/include.php`?"; }
  if ($isolates) { $encounters = load_encounters_for_isolates($db, $isolates); }
  if (!$encounters) { $error = "Could not load encounter data; is there an `.encounters.tsv` file corresponding to the `.heatmap.json` file?"; }
}

?>
<head>
  
<meta charset="utf-8" />
<title>Surveillance Isolates - Dendrogram with Timeline</title>

<link rel="stylesheet" href="css/d3-tip.css" />
<link rel="stylesheet" href="css/phylotree.css">
<link rel="stylesheet" href="css/phylotree.bootstrap.css">
<link rel="stylesheet" href="css/style.css">

<script src="js/underscore-min.js"></script>
<script src="js/jquery.min.js"></script>
<script src="js/d3.v3.js" charset="utf-8"></script>
<script src="js/phylotree.js"></script>
<script src="js/d3-tip.js"></script>
<script src="js/utils.js"></script>


<?php
if (file_exists(dirname(__FILE__).'/js/config.js')) { ?><script src="js/config.js" charset="utf-8"></script><?php }
else { ?><script src="js/example.config.js" charset="utf-8"></script><?php }
?>

<?php includeAfterHead(); ?>

</head>

<body>
  
<?php includeBeforeBody(); ?>

<?php if ($error): ?>
<div class="error"><?= htmlspecialchars($error) ?></div>
<?php else: ?>

<div id="controls">
  <div class="toolbar">
    <label class="widget">
      <span class="widget-label">Color by</span>
      <select id="color-nodes" name="color_nodes">
        <option value="ordered">Order date</option>
        <option value="collection_unit">Collection unit</option>
      </select>
    </label>
    <label class="widget">
      <span class="widget-label">Scale tree by</span>
      <select id="color-nodes" name="color_nodes" disabled>
        <option value="divergence">Divergence (SNPs per Mbp)</option>
        <option value="time">Time</option>
      </select>
    </label>
    <div class="clear"></div>
  </div>
</div>

<div id="dendro-timeline">
  <svg id="color-scale" width="100" height="300"></svg>
  <svg id="dendro"></svg>
  
  <div class="toolbar clear">
    <label class="widget">
      <span class="widget-label">Filter timeline events</span>
      <select id="filter" name="filter">
        <option value="inpatient">Inpatient only</option>
        <option value="outpatient">Outpatient only</option>
        <option value="">All encounters</option>
      </select>
    </label>
    <label class="widget">
      <span class="widget-label">Timeline Y axis </span>
      <select id="timeline-grouping" name="timeline_grouping">
        <option value="0,1">Group by patient, then by location</option>
        <option value="1,0">Group by location, then eRAP ID</option>
        <option value="0">Group by patient only</option>
        <option value="1">Group by location only</option>
      </select>
    </label>
    <label class="widget">
      <span class="widget-label">On hover </span>
      <select id="hover" name="hover">
        <option value="tooltip">Show tooltip</option>
        <option value="unit" selected>Highlight same unit</option>
        <option value="patient">Highlight same patient</option>
        <option value="">Do nothing</option>
      </select>
    </label>
  </div>
  
  <div id="timeline-cont" class="clear">
    <svg id="timeline" width="700" height="300">
      <defs>
        <pattern id="diagonal-stripe-5" patternUnits="userSpaceOnUse" width="10" height="10">
          <image xlink:href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxMCcgaGVpZ2h0PScxMCc+CiAgPHJlY3Qgd2lkdGg9JzEwJyBoZWlnaHQ9JzEwJyBmaWxsPSdibGFjaycvPgogIDxwYXRoIGQ9J00tMSwxIGwyLC0yCiAgICAgICAgICAgTTAsMTAgbDEwLC0xMAogICAgICAgICAgIE05LDExIGwyLC0yJyBzdHJva2U9J3doaXRlJyBzdHJva2Utd2lkdGg9JzInLz4KPC9zdmc+" x="0" y="0" width="10" height="10">
          </image>
        </pattern>
      </defs>
    </svg>
  </div>
</div>

<script src="js/pathogendb.dendro-timeline.js"></script>
<script type="text/javascript">
  var prunedTree = <?= json_encode($pruned_tree); ?>;
  var isolates = <?= json_encode($isolates); ?>;
  var encounters = <?= json_encode($encounters); ?>;
  
  var dateRegex = (/\d{4}-\d{2}-\d{2}/);
  var timeRegex = (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}/);
  
  // Preprocess specially formatted fields in `isolates`
  _.each(isolates, function(v) {
    if (dateRegex.test(v.order_date) && v.order_date > '1901-00-00') { 
      v.ordered = new Date(v.order_date);
    }
    v.collection_unit = fixUnit(v.collection_unit);
  });
  
  // Preprocess `encounters` into an array of objects (unpacking it from an array-of-arrays with a header row)
  encounters = _.map(encounters.slice(1), function(v) { return _.object(encounters[0], v);  });
  // Preprocess specially formatted fields in `encounters`
  _.each(encounters, function(v) {
    v.start_time = timeRegex.test(v.start_time) ? new Date(v.start_time) : null;
    v.end_time = timeRegex.test(v.end_time) ? new Date(v.end_time) : null;
    v.department_name = fixUnit(v.department_name);
  });
  
  $(function() {
    dendroTimeline(prunedTree, isolates, encounters, '.navbar');
  });
</script>

<?php endif; ?>

<?php includeAfterBody(); ?>

</body>
</html>