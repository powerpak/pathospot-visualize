<!DOCTYPE html>
<html>
<?php
if (file_exists(dirname(__FILE__).'/php/include.php')) { require(dirname(__FILE__).'/php/include.php'); }
else { require(dirname(__FILE__).'/php/example.include.php'); }

require(dirname(__FILE__).'/php/lib.dendro-timeline.php');

list($db, $assembly_names, $isolates, $matching_tree, $error) = parse_query_string($_GET);

if (!$error) {
  if (!$matching_tree) { $error = "Could not find a fully-linked tree that connects all the specified assemblies."; }
  else { $pruned_tree = prune_tree($matching_tree, $assembly_names); }
  if (!$pruned_tree) { $error = "Error running `scripts/prune-newick.py`; is \$PYTHON (with ete3 installed) configured in `php/include.php`?"; }
}

?>
<head>
  
<meta charset="utf-8" />
<title>Surveillance Isolates - Dendrogram with Timeline</title>

<link rel="stylesheet" href="css/phylotree.css">
<link rel="stylesheet" href="css/phylotree.bootstrap.css">
<link rel="stylesheet" href="css/style.css">


<script src="js/underscore-min.js"></script>
<script src="js/jquery.min.js"></script>
<script src="js/d3.v3.js" charset="utf-8"></script>
<script src="js/phylotree.js"></script>
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
    <div class="clear"/>
  </div>
</div>

<div id="dendro-timeline">
  <svg id="color-scale" width="100" height="300"></svg>
  <svg id="dendro"></svg>
</div>

<script src="js/pathogendb.dendro-timeline.js"></script>
<script type="text/javascript">
  var prunedTree = <?= json_encode($pruned_tree); ?>;
  var isolates = <?= json_encode($isolates); ?>;
  
  // Parse out certain fields that are specially formatted
  _.each(isolates, function(v) {
    if ((/\d{4}-\d{2}-\d{2}/).test(v.order_date) && v.order_date > '1901-00-00') { 
      v.ordered = new Date(v.order_date);
      v.collection_unit = fixUnit(v.collection_unit);
    }
  });
  
  $(function(){
    // Constants.
    var colors = ["#511EA8", "#4928B4", "#4334BF", "#4041C7", "#3F50CC", "#3F5ED0", "#416CCE", "#4379CD", "#4784C7", "#4B8FC1", "#5098B9", "#56A0AF", "#5CA7A4", "#63AC99", "#6BB18E", "#73B583", "#7CB878", "#86BB6E", "#90BC65", "#9ABD5C", "#A4BE56", "#AFBD4F", "#B9BC4A", "#C2BA46", "#CCB742", "#D3B240", "#DAAC3D", "#DFA43B", "#E39B39", "#E68F36", "#E68234", "#E67431", "#E4632E", "#E1512A", "#DF4027", "#DC2F24"];
    var unknownColor = "#AAA";
    var nodeRadius = 4;
    
    // Scales, formats, and other objects for setting up d3.js
    var spectralScale = d3.scale.linear()
        .domain(_.range(colors.length))
        .interpolate(d3.interpolateHcl)
        .range(_.map(colors, function(v) { return d3.rgb(v); }));
    var orderedScale = d3.time.scale()
        .range([0, colors.length - 1]);
    var orderedFormat = d3.time.format("%b %Y");
    var collectionUnitScale = d3.scale.ordinal()
        .domain(_.uniq(_.compact(_.pluck(isolates, 'collection_unit'))).sort())
        .rangePoints([0, colors.length - 1]);
    var isLeafNode = d3.layout.phylotree.is_leafnode;
    
    // jQuery objects for controls that can update the visualization
    var $colorBy = $('#color-nodes');
    var colorByFunctions = {
      ordered: function(isolate) { 
        return isolate.ordered ? spectralScale(orderedScale(isolate.ordered)) : unknownColor; 
      },
      collection_unit: function(isolate) {
        return isolate.collection_unit ? spectralScale(collectionUnitScale(isolate.collection_unit)) : 
            unknownColor;
      }
    }
    
    // =====================================
    // = Setup the phylotree.js in #dendro =
    // =====================================
    
    var tree = d3.layout.phylotree()
        .options({
          brush: false,
          selectable: false,
          "align-tips": true
        })
        .node_circle_size(0)
        .svg(d3.select("#dendro"));
    
    // Custom node styler to color the node tip and add extra metadata to the right-hand side
    tree.style_nodes(function(container, node) {
      if (d3.layout.phylotree.is_leafnode(node)) {
        var shiftTip = tree.shift_tip(node)[0];
        var circle = container.selectAll("circle").data([node]);
        var isolate = isolates[node.name];
        var fillColor = colorByFunctions[$colorBy.val()](isolate);
        var strokeColor = d3.rgb(fillColor).darker().toString();
      
        circle.exit().remove();
        
        circle.enter().append("circle")
            .attr("r", nodeRadius)
            .attr("cx", nodeRadius);
        
        circle.style("fill", fillColor)
            .style("stroke", strokeColor);
      
        container.selectAll("text")
            .attr("x", nodeRadius * 2.5)
            .text(isolate.isolate_ID + ' : ' + isolate.order_date + ' : ' + isolate.collection_unit);
      }
    });
    
    // Parse the Newick-formatted prunedTree for the specified `assemblies` in the query string
    tree(prunedTree);
    
    // Root the tree on the chronologically first isolate
    var earliest = _.min(tree.get_nodes(), function(node) { 
      return isLeafNode(node) ? isolates[node.name].ordered : Infinity;
    });
    var latest = _.max(tree.get_nodes(), function(node) { 
      return isLeafNode(node) ? isolates[node.name].ordered : -Infinity;
    });
    orderedScale.domain([isolates[earliest.name].ordered, isolates[latest.name].ordered]);
    tree.reroot(earliest);
    tree.layout();
    
    window.tree = tree; //FIXME: makes debugging easier.
    
    // ==========================
    // = Setup the color legend =
    // ==========================
    
    function updateColorLegend(tree) {
      var colorSvg = d3.select("#color-scale");
      var swatchHeight = 20;
      var idealNumSwatches = Math.min(_.keys(isolates).length, 8);
      var labelFormatter = _.identity;
      var colorSwatches, fillFunction, swatchData;
      
      if ($colorBy.val() == 'ordered') {
        swatchData = idealNumSwatches > 3 ? orderedScale.ticks(idealNumSwatches) : orderedScale.domain();
        fillFunction = function(d) { return spectralScale(orderedScale(d)) };
        labelFormatter = orderedFormat;
      } else {
        swatchData = collectionUnitScale.domain();
        fillFunction = function(d) { return spectralScale(collectionUnitScale(d)) };
      }
      colorSwatches = colorSvg.selectAll("g").data(swatchData);
      
      colorSvg.attr("height", Math.max(tree.size()[0], swatchData.length * swatchHeight));
      
      colorSwatches.exit().remove();
    
      var swatchEnter = colorSwatches.enter().append("g")
          .attr("transform", function(d, i) { return "translate(0," + (i * swatchHeight) + ")" });
      swatchEnter.append("rect")
          .attr("width", swatchHeight * 0.6)
          .attr("height", swatchHeight * 0.6);
      swatchEnter.append("text")
          .attr("x", swatchHeight)
          .attr("y", swatchHeight * 0.5);
          
      colorSwatches.select("rect")
          .style("fill", fillFunction);
      colorSwatches.select("text")
          .text(labelFormatter);
    }
    updateColorLegend(tree);
    
    // ==============================================================
    // = Setup callbacks for controls that update the visualization =
    // ==============================================================
    $colorBy.change(function() {
      tree.update();
      updateColorLegend(tree);
    });
  });
</script>

<?php endif; ?>

<?php includeAfterBody(); ?>

</body>
</html>