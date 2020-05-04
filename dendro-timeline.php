<!DOCTYPE html>
<html>
<?php
if (file_exists(dirname(__FILE__).'/php/include.php')) { require(dirname(__FILE__).'/php/include.php'); }
else { require(dirname(__FILE__).'/php/example.include.php'); }

require(dirname(__FILE__).'/php/lib.dendro-timeline.php');

// Have we already picked assemblies (specified in query string), or do we need to show the UI to do so?
$picking_assemblies = !isset($_GET['assemblies']);

// Load everything we can from the .heatmap.json.
// Note that for our purposes, $assembly_names serve as the primary IDs for each of the $isolates
list($db, $assembly_names, $isolates, $matching_tree, $which_tree, $db_json, $error) = load_from_heatmap_json($_GET);

if (!$error && !$picking_assemblies) {
  if ($matching_tree) { $pruned_tree = prune_tree($matching_tree, $assembly_names); }
  if (!$pruned_tree) { $error = "Error running `scripts/prune-newick.py`; is \$PYTHON (with ete3 installed) configured in `php/include.php`?"; }
  if ($isolates) { 
    $encounters = load_encounters_for_isolates($db, $isolates);
    $variants_json = variants_for_assemblies_as_json($db, $which_tree, $assembly_names);
    $epi = load_epi_for_isolates($db, $isolates, $db_json["taxonomy_IDs"]);
  }
  if (!$encounters) { $error = "Could not load encounter data; is there an `.encounters.tsv` file corresponding to the `.heatmap.json` file?"; }
  $pick_assemblies_url = basename(__FILE__) . "?db={$db}&select=" . implode('+', $assembly_names);
}

?>
<head>
  
<meta charset="utf-8" />
<title>Surveillance Isolates - Dendrogram with Timeline</title>

<link rel="stylesheet" href="css/d3-tip.css" />
<link rel="stylesheet" href="css/select2.css" />
<link href="css/rangeslider.css" rel="stylesheet" />
<link rel="stylesheet" href="css/ionicons.min.css" />
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

<body class="pathospot-dendro-timeline">
  
<?php includeBeforeBody(); ?>

<?php 
// =============================================
// = Error occurred: show the message and halt =
// =============================================
if ($error): 
?>

<div class="error"><?= htmlspecialchars($error) ?></div>

<?php 
// =========================
// = Assembly picking mode =
// =========================
elseif ($picking_assemblies): 
?>

<div id="pick-assemblies">
  <div class="col">
    <div class="top-section">
      <label for="filter" class="widget-label">Filter the isolates / assemblies</label>
      <select id="filter" name="filter" class="select2" multiple="multiple">
      </select>
    </div>
    <table class="assemblies-list" id="list-left">
      <tr>
        <th class="tree"><i class="icon ion-md-folder"></i></th>
        <th>Isolate ID</th><th>Anon Pt ID</th><th class="date">Date</th><th>Unit</th>
        <th class="btn-col"></th>
      </tr>
    </table>
  </div>
  <div class="col thin center">
    <label>
      <a class="btn toggle-btn toggle-btn-both" id="add-all" href="javascript:void(0)">
        Add all<br/>
        <i class="icon ion-md-more"></i><br/>
        <i class="icon ion-md-add-circle"></i> 
      </a>
    </label>
    <label>
      <a class="btn toggle-btn toggle-btn-both" id="remove-all" href="javascript:void(0)">
        Remove all<br/>
        <i class="icon ion-md-more"></i><br/>
        <i class="icon ion-md-remove-circle"></i> 
      </a>
    </label>
  </div>
  <div class="col" id="assemblies-to-plot">
    <div class="top-section">
      <label class="widget-label">Isolates that will be plotted</label>
      <div class="center">
        <a class="toggle-btn toggle-btn-both btn-primary" href="javascript:void(0)" id="plot-assemblies">
          Plot these isolates
          <i class="icon ion-md-checkmark-circle"></i> 
        </a>
      </div>
    </div>
    <table class="assemblies-list" id="list-right">
      <tr>
        <th class="btn-col"></th>
        <th class="tree"><i class="icon ion-md-folder"></i></th>
        <th>Isolate ID</th><th>Anon Pt ID</th><th class="date">Date</th><th>Unit</th>
      </tr>
    </table>
  </div>
</div>

<script src="js/select2.min.js" charset="utf-8"></script>
<script src="js/pathogendb.pick-assemblies.js"></script>
<script type="text/javascript">
  var isolates = <?= json_encode($isolates); ?>;
  var assemblyNames = <?= json_encode($assembly_names); ?>;
  var whichTree = <?= json_encode($which_tree); ?>;
  var db = <?= json_encode($db); ?>;
  $(function() {
    pickAssemblies(isolates, assemblyNames, whichTree, db);
  });
</script>

<?php
// ====================================
// = Show the full dendro-timeline UI =
// ====================================
else:
?>

<div id="controls">
  <div class="toolbar">
    <label class="widget">
      <a class="toggle-btn toggle-btn-both" href="<?= htmlspecialchars($pick_assemblies_url) ?>">
        Add/remove isolates...
      </a>
    </label>
    <label class="widget pad-top">
      <span class="widget-label">Color by</span>
      <select id="color-nodes" name="color_nodes">
        <option value="collection_unit">Collection unit</option>
        <option value="ordered">Order date</option>
      </select>
    </label>
    <!--
    hide until we implement it
    <label class="widget">
      <span class="widget-label">Scale tree by</span>
      <select id="color-nodes" name="color_nodes" disabled>
        <option value="divergence">Divergence (SNPs per Mbp)</option>
        <option value="time">Time</option>
      </select>
    </label>
    -->
    <label class="widget pad-top">
      <span class="widget-label">Variant labels</span>
      <select id="variant-labels" name="variant_labels">
        <option value="">Hide</option>
        <option value="gene" selected>Gene names</option>
        <option value="gene+pos">Gene & position</option>
        <option value="desc">Gene description</option>
        <option value="chrom+pos">Genomic position</option>
      </select>
      <select id="variant-nt-or-aa" name="variant_nt_or_aa">
        <option value="nt" selected>Nucleotides</option>
        <option value="aa">Amino acids</option>
      </select>
    </label>
    <div class="clear"></div>
  </div>
</div>

<div id="dendro-timeline">
  <svg id="color-scale" width="100" height="300"></svg>
  <svg id="dendro"></svg>
  
  <div class="clear">
    <svg id="dendro-variant-labels" width="100" height="10"></svg>
  </div>
  
  <div class="toolbar clear">
    <label class="widget less-margin">
      <a id="show-overlaps" class="toggle-btn mini toggle-btn-both active">Show overlaps</a>
    </label>
    <label class="widget">
      <span class="units">within</span>
      <input id="tolerance-num" name="tolerance_num" type="text" size="2" value="12" disabled />
      <span class="units" id="tolerance-units">hrs</span>
      <input id="tolerance" name="tolerance" class="range" type="range" />
    </label>
    <label class="widget">
      <span class="widget-label">Y axis </span>
      <select id="timeline-grouping" name="timeline_grouping">
        <option value="0,1">Group by patient, then location</option>
        <option value="1,0">Group by location, then patient</option>
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
    <label class="widget">
      <span class="widget-label">Filter events</span>
      <select id="filter" name="filter">
        <option value="inpatient">Inpatient</option>
        <option value="outpatient">Outpatient</option>
        <option value="">Both</option>
      </select>
    </label>
    <label class="widget">
      <span class="widget-label">Filter culture results</span>
      <select id="isolate-tests" name="isolateTests">
        <option value="" selected>Sequenced only</option>
        <option value="seq-and-same-species">Same species (+) and all (-)</option>
        <option value="seq-and-any-species">All (+) and (-)</option>
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
        <marker id="arrow" markerWidth="10" markerHeight="10" refX="0" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L9,3 z" fill="#f00" />
        </marker>
      </defs>
    </svg>
  </div>
</div>

<script src="js/rangeslider.min.js" charset="utf-8"></script>
<script src="js/pathogendb.dendro-timeline.js"></script>
<script type="text/javascript">
  var prunedTree = <?= json_encode($pruned_tree); ?>;
  var isolates = <?= json_encode($isolates); ?>;
  var encounters = <?= json_encode($encounters); ?>;
  var variants = <?= $variants_json ?>;
  var epi = <?= json_encode($epi); ?>;
  
  var dateRegex = (/^\d{4}-\d{2}-\d{2}/);
  var timeRegex = (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}/);
  var timeSuffixForDates = 'T12:00:00-04:00';
  
  // Preprocess specially formatted fields in `isolates`
  _.each(isolates, function(v) {
    if (dateRegex.test(v.order_date) && v.order_date > '1901-00-00') {
      if (!timeRegex.test(v.order_date)) { v.ordered += timeSuffixForDates; }
      v.ordered = new Date(v.order_date);
    }
    v.collection_unit = fixUnit(getHospitalAndUnit(v));
    v.eRAP_ID = _.isUndefined(v.eRAP_ID) || v.eRAP_ID === null ? '' : v.eRAP_ID.toString();
  });
  
  // Preprocess `encounters` into an array of objects (unpacking it from an array-of-arrays with a header row)
  encounters = _.map(encounters.slice(1), function(v) { return _.object(encounters[0], v);  });
  // Preprocess specially formatted fields in `encounters`
  _.each(encounters, function(v) {
    v.start_time = timeRegex.test(v.start_time) ? new Date(v.start_time) : null;
    v.end_time = timeRegex.test(v.end_time) ? new Date(v.end_time) : null;
    v.department_name = fixUnit(getHospitalAndUnit(v, "department_name"));
    if (v.encounter_type != "Hospital Encounter") {
      if (v.start_time && v.end_time && v.start_time.getTime() == v.end_time.getTime()) {
        v.end_time.setHours(v.end_time.getHours() + 24);
      }
    }
  });
  
  // Unpack tabular arrays-of-arrays in `variants` into objects and preprocess special fields
  if (variants.allele_info) {
    variants.allele_info = tabularIntoObjects(variants.allele_info);
    _.each(variants.allele_info, function(allele) { 
      allele.nt_alts = allele.alt.split(',');
      allele.aa_alts = allele.aa_alt && allele.aa_alt.split(',');
    });
    variants.chrom_sizes = tabularIntoObjects(variants.chrom_sizes);
  }
  
  // Unpack tabular arrays-of-arrays in `epi` into objects and preprocess special fields
  if (epi.isolate_test_results) {
    epi.isolate_test_results = tabularIntoObjects(epi.isolate_test_results);
    epi.isolate_test_results = _.filter(epi.isolate_test_results, function(v) {
      if (dateRegex.test(v.test_date) && !timeRegex.test(v.test_date)) {
        v.test_date += timeSuffixForDates;
      }
      v.collection_unit = fixUnit(getHospitalAndUnit(v));
      v.test_date = timeRegex.test(v.test_date) ? new Date(v.test_date) : null;
      v.eRAP_ID = v.eRAP_ID.toString();
      v.negative = v.test_result === "negative";
      return !_.isNull(v.test_date);
    });
  }
  
  d3.json("js/organisms.json", function(organisms) { epi.organisms = organisms; });
  
  $(function() {
    dendroTimeline(prunedTree, isolates, encounters, variants, epi, '.navbar');
  });
</script>

<?php
endif;
?>

<?php includeAfterBody(); ?>

</body>
</html>