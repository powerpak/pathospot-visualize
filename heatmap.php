<!DOCTYPE html>
<html>
<?php
if (file_exists(dirname(__FILE__).'/php/include.php')) { require(dirname(__FILE__).'/php/include.php'); }
else { require(dirname(__FILE__).'/php/example.include.php'); }

$data_files = glob(dirname(__FILE__).'/data/*.heatmap.json');
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
      <span class="units">SNPs</span>
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
  </div>
</div>

<script type="text/javascript">

var ANON = getURLParameter('anon');

function fixUnit(unit) {
  if (unit) {
    unit = unit.replace(/EMERGENCY DEPARTMENT/, 'ED');
    unit = unit.replace(/INITIAL DEPARTMENT/, '??');
    unit = unit.replace(/NS INTERNAL MEDICINE/, 'NS IM');
    unit = unit.replace(/^FPA.*/, 'FPA');
    if (ANON) { unit = rot13(unit); }
  }
  return unit;
}

function formatDate(d) {
  if (!d) { return ''; }
  d = new Date(d);
  return d.getFullYear() + '-' + ("0" + (d.getMonth() + 1)).slice(-2) + '-' + ("0" + d.getDate()).slice(-2);
}

// one-liner from http://stackoverflow.com/questions/11582512/how-to-get-url-parameters-with-javascript/11582513
function getURLParameter(name) {
  return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)')
      .exec(location.search) || [null, ''])[1]
      .replace(/\+/g, '%20')) || null;
}

function numberWithCommas(x) {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function rot13(s) {
  return s.replace(/[a-zA-Z]/g,function(c){return String.fromCharCode((c<="Z"?90:122)>=(c=c.charCodeAt(0)+13)?c:c-26);});
}

function getFilters() {
  var filters = $('#filter').val(),
    mlstFilters = _.filter(filters, function(v) { return (/^MLST:/).test(v); }),
    unitFilters = _.filter(filters, function(v) { return (/^Unit:/).test(v); });
  return {
    mergeSamePt: _.contains(filters, 'mergeSamePt'), 
    clustersOnly: _.contains(filters, 'clustersOnly'),
    mlsts: _.map(mlstFilters, function(v) { return v.split(':')[1]; }),
    units: _.map(unitFilters, function(v) { return v.split(':')[1]; })
  };
}

Array.prototype.swap = function (x, y) {
  var b = this[x];
  this[x] = this[y];
  this[y] = b;
  return this;
}

$(function() { 

  // *************************** SVG/D3 SETUP *********************************

  var margin = {top: 60, right: 300, bottom: 10, left: 80},
      width = 600,
      height = 600,
      sliderHeight = 80,
      DEFAULT_SNP_THRESHOLD = parseInt($('#snps-num').val(), 10),
      MAX_SNP_THRESHOLD = 100,
      TRANSITION_DURATION = 1000,
      PREPROCESS_FIELDS = {collection_unit: fixUnit, ordered: formatDate};
  
  var x = d3.scaleBand().range([0, width]),
      z = d3.scaleLinear().domain([DEFAULT_SNP_THRESHOLD + 1, 0]).clamp(true),
      c = d3.scaleOrdinal(d3.schemeCategory10.swap(0, 3)).domain(d3.range(10));

  var svg = d3.select("body").append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
    .append("g")
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
    
  var db = (getURLParameter('db') || $('#db').val()).replace(/[^\w_.-]+/g, '');
  $('#db').val(db);
  document.title = $('#db > option[value="'+ db +'"]').text() + ' - Heatmap';
  
  // Setup the slider and bind it to changing the disabled input
  $('#snps').attr({value: DEFAULT_SNP_THRESHOLD, max: MAX_SNP_THRESHOLD}).rangeslider({ 
    polyfill: false,
    onSlide: function(position, value) { $('#snps-num').val(value); },
    onSlideEnd: function(position, value) { $('#snps-num').change(); }
  });

  d3.json("data/" + db + ".heatmap.json", function(assemblies) {

    var nodes = assemblies.nodes,
        links = assemblies.links,
        n = nodes.length,
        idealBandWidth = Math.max(width / n, 16),
        filteredDomain = [],
        rand20 = Math.floor(Math.random() * 20),
        fullMatrix, visibleNodes, filteredClusters;
  
    // **************************  LOAD AND SETUP DATA STRUCTURES *****************************
  
    // This recalculates and DESTRUCTIVELY modifies the following globals above
    // `nodes`: the full list of nodes
    // `fullMatrix`: the full distance matrix
    // `visibleNodes`: which nodes should show up in the daterange selector and in the matrix based on `filters`
    // `filteredClusters`: the clusters that were detected in `visibleNodes`
    // 
    // The parameter `filters` is an object with the following possible keys:
    //   `mergeSamePt: true` will merge nodes with the same eRAP_ID
    //   `clustersOnly: true` will hide nodes that don't have any matching nodes above snpThreshold
    //   `mlsts: ['1', '4', ...]` will show only nodes that have these mlst_subtypes
    function calculateMatrixAndVisibleNodes(nodes, links, snpThreshold, filters) {
      var matrix = [],
        samePtClusters = [],
        allClusters;
        
      filters = _.extend({}, filters);
    
      // Reset the nodes array and initialize the rows of the matrix, which is in matrix[y][x] orientation
      _.each(nodes, function(node, i) {
        node.i = i;
        node.count = 0;
        node.group = null;
        node.groupOrder = null;
        node.samePtMergeParent = false;
        node.samePtMergeChild = false;
        if (_.isUndefined(node.ordered)) {
          node.ordered = null;
          if ((/\d{4}-\d{2}-\d{2}/).test(node.order_date) && node.order_date > '1901-00-00') { 
            node.ordered = new Date(node.order_date);
            if (ANON) { node.ordered = node.ordered.setMonth(node.ordered.getMonth() + rand20 + 10); }
          }
        }
        if (_.isUndefined(node.contig_N50_format)) {
          node.contig_N50_format = numberWithCommas(node.contig_N50);
          node.contig_maxlength_format = numberWithCommas(node.contig_maxlength);
        }
        matrix[i] = d3.range(n).map(function(j) { return {x: j, y: i, z: 0, origZ: null}; });
        matrix[i].y = i;
      });

      // Convert links to matrix, WHILE detecting same-patient clusters if they need to be merged
      // Clustering for the purposes of merging here is done via a single-linkage criterion
      _.each(links, function(link) {
        var sourceClusterIndex, targetClusterIndex;
        matrix[link.source][link.target].z += link.value;
        if (link.value <= snpThreshold) {
          if (nodes[link.source].eRAP_ID != nodes[link.target].eRAP_ID) {
            nodes[link.source].count += 0.5; 
            nodes[link.target].count += 0.5;
          } else if (filters.mergeSamePt) {
            sourceClusterIndex = _.findIndex(samePtClusters, function(clust) { return _.contains(clust, link.source); });
            targetClusterIndex = _.findIndex(samePtClusters, function(clust) { return _.contains(clust, link.target); });
            if (sourceClusterIndex >= 0) {
              if (sourceClusterIndex == targetClusterIndex) { return; }
              if (targetClusterIndex >= 0) {
                samePtClusters[sourceClusterIndex] = samePtClusters[sourceClusterIndex] + samePtClusters[targetClusterIndex];
                samePtClusters.splice(targetClusterIndex, 1);
              } else {
                samePtClusters[sourceClusterIndex].push(link.target);
              }
            } else if (targetClusterIndex >= 0) {
              samePtClusters[targetClusterIndex].push(link.source);
            } else {
              samePtClusters.push([link.source, link.target]);
            }
          }
        }
      });
      
      // if `filters.mergeSamePt`, take those same-patient clusters, and update matrix rows/cols for the
      // the first-observed node (which becomes the parent) to become singly linked to all other nodes
      if (filters.mergeSamePt) {
        samePtClusters = _.map(samePtClusters, function(clust) {
          return _.sortBy(clust, function(i) { return nodes[i].ordered || new Date(8640000000000000); });
        });
        _.each(samePtClusters, function(clust) {
          // reduce matrix rows/columns into the parent node's
          _.each(_.range(n), function(i) {
            matrix[clust[0]][i].origZ = matrix[clust[0]][i].z;
            matrix[i][clust[0]].origZ = matrix[i][clust[0]].z;
            matrix[clust[0]][i].z = _.min(_.map(_.pick(matrix, clust), function(row) { return row[i].z; }));
            matrix[i][clust[0]].z = _.min(_.map(_.pick(matrix[i], clust), function(cell) { return cell.z; }));
          });
          // mark the parent/child nodes so they can be drawn differently
          nodes[clust[0]].samePtMergeParent = clust;
          _.each(_.rest(clust), function(i) { nodes[i].samePtMergeChild = true; });
        });
      }
      
      // Here, `filters` are applied to `nodes` to determine `visibleNodes`
      visibleNodes = _.reject(nodes, function(node) { return node.samePtMergeChild; });
      if (filters.clustersOnly) { 
        visibleNodes = _.reject(visibleNodes, function(node) { return node.count <= 0; }); 
      }
      if (filters.mlsts && filters.mlsts.length) {
        visibleNodes = _.filter(visibleNodes, function(node) { return _.contains(filters.mlsts, node.mlst_subtype); }); 
      }
      if (filters.units && filters.units.length) {
        visibleNodes = _.filter(visibleNodes, function(node) { return _.contains(filters.units, node.collection_unit); }); 
      }
    
      if (visibleNodes.length) {
        // Agglomerative, single-linkage hierarchical clustering based on the above dissimilarity matrix
        // Hierarchical clustering expects symmetrical distances, so we average across the diagonal of the dissimilarity matrix
        function disFunc(a, b) { return (matrix[a.i][b.i].z + matrix[b.i][a.i].z) / 2; }
        allClusters = HClust.agnes(visibleNodes, {disFunc: disFunc, kind: 'single'});
        _.each(allClusters.index, function(leaf, i) { visibleNodes[leaf.index].groupOrder = i;  });
        
        // Find all clusters with diameter below the snpThreshold with >1 children
        allClusters = _.filter(allClusters.cut(snpThreshold), function(clust) { return clust.children; });
        // Sort them by size, in descending order
        filteredClusters = _.sortBy(allClusters, function(clust) { return -clust.index.length; });
        // then annotate the nodes with the # of the cluster they are in
        _.each(filteredClusters, function(clust, i) {
          _.each(clust.index, function(leaf) { visibleNodes[leaf.index].group = i; });
        });
      }
    
      fullMatrix = matrix;
    }
    calculateMatrixAndVisibleNodes(nodes, links, DEFAULT_SNP_THRESHOLD, getFilters());

    // ************************* FILTERING AND ORDERING *****************************
  
    function calculateOrder(orderMethod) {
      switch (orderMethod) {
        case 'groupOrder':
          return d3.range(n).sort(function(a, b) { return nodes[b].groupOrder - nodes[a].groupOrder; });
        case 'order_date':
          return d3.range(n).sort(function(a, b) { 
            return d3.ascending(nodes[a].order_date, nodes[b].order_date)
                || d3.ascending(nodes[a].groupOrder, nodes[b].groupOrder);
          });
        case 'collection_unit':
          return d3.range(n).sort(function(a, b) {
            return d3.ascending(nodes[a].collection_unit, nodes[b].collection_unit)
                || d3.ascending(nodes[a].groupOrder, nodes[b].groupOrder);
          });
        case 'mlst_subtype':
          return d3.range(n).sort(function(a, b) { 
            return d3.ascending(nodes[a].mlst_subtype, nodes[b].mlst_subtype)
                || d3.ascending(nodes[a].groupOrder, nodes[b].groupOrder);
          });
        case 'eRAP_ID':
          return d3.range(n).sort(function(a, b) { return d3.ascending(nodes[a].eRAP_ID, nodes[b].eRAP_ID); });
      }
    }
    
    // Filters an ordered set of indexes by whether the node was merged into a similar node
    // from the same patient (if it was, it is removed)
    function filterOrderByVisibleNodes(order) {
      var visibleNodeIndexes = {};
      _.each(visibleNodes, function(node) { visibleNodeIndexes[node.i] = true; });
      return _.filter(order, function(i) { return visibleNodeIndexes[i]; });
    }

    // Filters an ordered set of indexes by the current date range brush selection.
    function filterOrderByBrush(order) {    
      var selection = d3.brushSelection(brushg.node()),
        start, end;
        
      if (selection === null) { return order; }
      start = sliderX.invert(selection[0]);
      end = sliderX.invert(selection[1]);
      return _.filter(order, function(i) { return nodes[i].ordered >= start && nodes[i].ordered <= end; });
    }
    x.domain(calculateOrder('groupOrder'));
    
    // ***************************** BRUSH SLIDER ************************************
    
    var orderDates = _.compact(_.pluck(nodes, "ordered"));
    
    var sliderSvg = d3.select("#controls").append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", sliderHeight + 20)
        .append("g")
        .attr("transform", "translate(" + margin.left + ",0)");
    
    var sliderX = d3.scaleTime().domain([_.min(orderDates), _.max(orderDates)]).nice().range([0, width]);
    var sliderY = d3.randomNormal(sliderHeight / 2, sliderHeight / 8);  

    var brush = d3.brushX()
        .extent([[0, 0], [width, sliderHeight - 1]])
        .on("start", brushstart)
        .on("brush", _.debounce(brushmove, 200))
        .on("end", brushend);
    
    sliderSvg.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0," + sliderHeight + ")")
        .call(d3.axisBottom().scale(sliderX));
    
    sliderSvg.append("g")
        .attr("class", "beeswarm");
  
    function updateNodes(filteredNodes) {
      var simulation = d3.forceSimulation(filteredNodes)
          .force("x", d3.forceX(function(d) { return d.ordered ? sliderX(d.ordered) : -1000; }).strength(1))
          .force("y", d3.forceY(sliderHeight / 2))
          .force("collide", d3.forceCollide(4.5))
          .stop();
          
      for (var i = 0; i < 120; ++i) simulation.tick();

      var circle = sliderSvg.select("g.beeswarm").selectAll("circle")
          .data(filteredNodes, function(d) { return d.i; });
    
      var circleEnter = circle.enter().append("circle")
          .attr("title", function(d) { return d.order_date; })
          .attr("r", 4);

      circleEnter.merge(circle)
          .attr("visibility", function(d) { return d.ordered ? "visible" : "hidden"; })
          .attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")"; })
          .attr("class", function(d) { return d.count > 0 ? 'transmission' : '' })
          .classed("selected", function(d) { return _.contains(filteredDomain, d.i); })
          .style("stroke", function(d) { return d.group !== null ? c(d.group) : null })
          .style("fill", function(d) { return d.count > 0 && d.group !== null ? c(d.group) : null });
          
      circle.exit().remove();
    }
    updateNodes(visibleNodes);

    var brushg = sliderSvg.append("g")
        .attr("class", "brush")
        .call(brush);

    function brushstart(event) {
      svg.classed("selecting", true);
    }

    function brushmove(event) {
      interruptAllTransitions();
      reorder();
      sliderSvg.select("g.beeswarm").selectAll("circle")
        .classed("selected", function(d) { return _.contains(filteredDomain, d.i); });
    }

    function brushend(event) {
      reorder();
      //svg.classed("selecting", !event.target.empty());
    }
  
    // **************************** HEATMAP ************************************

    function columnKeying(d) { return d.y; }
    function cellKeying(d) { return d.x; }
  
    function cellColor(d) {
      if (d.x == d.y) { return 'white'; }
      if (nodes[d.x].eRAP_ID == nodes[d.y].eRAP_ID) { return 'white'; }
      if (nodes[d.x].group != nodes[d.y].group) { return 'black'; }
      if (nodes[d.x].group === null) { return 'black'; }
      return c(nodes[d.x].group);
    }
    function cellStrokeColor(d) {
      if (nodes[d.x].eRAP_ID == nodes[d.y].eRAP_ID && d.x != d.y) { return c(nodes[d.x].group); }
      return null;
    }
    function cellPadding(d) {
      if (nodes[d.x].eRAP_ID == nodes[d.y].eRAP_ID && d.x != d.y) { return 1.5; }
      return 0.5;
    }
    function cellClickable(d) {
      return d.z < z.domain()[0] && d.x != d.y;
    }
    
    // background and axis/table labels
        
    svg.append("rect")
        .attr("class", "background")
        .attr("width", width)
        .attr("height", height)
    var rowsColsG = svg.append("g").attr("class", "rows-cols");
        
    svg.append("text")
        .attr("class", "axis-label")
        .attr("x", -6)
        .attr("y", -10)
        .attr("dy", ".32em")
        .attr("text-anchor", "end")
        .text("Anon Pt ID");
    
    svg.append("text")
        .attr("class", "axis-label")
        .attr("x", width + 6)
        .attr("y", -10)
        .attr("dy", ".32em")
        .attr("text-anchor", "start")
        .text("Unit");
        
    svg.append("text")
        .attr("class", "axis-label")
        .attr("x", width + 70)
        .attr("y", -10)
        .attr("dy", ".32em")
        .attr("text-anchor", "start")
        .text("Order Date");
        
    svg.append("text")
        .attr("class", "axis-label")
        .attr("x", width + 150)
        .attr("y", -10)
        .attr("dy", ".32em")
        .attr("text-anchor", "start")
        .text("MLST");
        
    svg.append("text")
        .attr("class", "axis-label")
        .attr("x", width + 210)
        .attr("y", -10)
        .attr("dy", ".32em")
        .attr("text-anchor", "start")
        .text("Isolate ID");
    
    var selectedCellReticle = svg.append("rect")
        .attr("class", "selected-cell")
        .attr("visibility", "hidden");
        
    // functions for updating rows/columns of the heatmap

    function updateColumns(matrix) {
      var column = rowsColsG.selectAll("g.column")
          .data(matrix, columnKeying);

      var columnEnter = column.enter().append("g")
          .attr("class", "column")
          .attr("transform", function(d) { return "translate(" + x(d.y) + ")rotate(-90)"; })
          .attr("opacity", 0)
      columnEnter.append("line")
          .attr("x1", -width);
      columnEnter.append("text")
          .attr("class", "col-label")
          .attr("x", 6)
          .attr("y", idealBandWidth / 2)
          .attr("dy", ".32em")
          .attr("text-anchor", "start")
          .text(function(d, i) { return nodes[d.y].eRAP_ID; });

      column.merge(columnEnter).transition().duration(TRANSITION_DURATION).delay(function(d, i) { return x(d.y) * 1; })
          .attr("transform", function(d) { return "translate(" + x(d.y) + ")rotate(-90)"; })
          .attr("opacity", 1)
        .selectAll("text.col-label")
          .style("fill", function(d) { return nodes[d.y].group !== null ? c(nodes[d.y].group) : '#ccc'; });

      column.exit().transition().duration(TRANSITION_DURATION)
          .attr("opacity", 0)
          .remove(); 
    }

    function updateRows(matrix) {
      var row = rowsColsG.selectAll("g.row")
          .data(matrix, columnKeying);
        
      var rowEnter = row.enter().append("g")
          .attr("class", function(d) { return "row" + (nodes[d.y].samePtMergeParent ? " merged" : ""); })
          .attr("transform", function(d) { return "translate(0," + x(d.y) + ")"; })
          .attr("opacity", 0);
      rowEnter.append("line")
          .attr("x2", width);
      rowEnter.append("text")
          .attr("class", "row-label pt-id")
          .attr("x", -6)
          .attr("y", idealBandWidth / 2)
          .attr("dy", ".32em")
          .attr("text-anchor", "end")
          .text(function(d) { return nodes[d.y].eRAP_ID; });
      rowEnter.append("text")
          .attr("class", "unit")
          .attr("x", width + 6)
          .attr("y", idealBandWidth / 2)
          .attr("dy", ".32em")
          .attr("text-anchor", "start")
          .text(function(d) { return fixUnit(nodes[d.y].collection_unit); });
      rowEnter.append("text")
          .attr("class", "date")
          .attr("x", width + 70)
          .attr("y", idealBandWidth / 2)
          .attr("dy", ".32em")
          .attr("text-anchor", "start")
          .text(function(d) { return formatDate(nodes[d.y].ordered); });
      rowEnter.append("text")
          .attr("class", "mlst")
          .attr("x", width + 150)
          .attr("y", idealBandWidth / 2)
          .attr("dy", ".32em")
          .attr("text-anchor", "start")
          .text(function(d) { return nodes[d.y].mlst_subtype; });
      rowEnter.append("text")
          .attr("class", "isolate-id row-label")
          .attr("x", width + 210)
          .attr("y", idealBandWidth / 2)
          .attr("dy", ".32em")
          .attr("text-anchor", "start")
          .text(function(d) { return nodes[d.y].samePtMergeParent ? "MERGED" : nodes[d.y].isolate_ID; });
    
      row.merge(rowEnter).each(updateRowCells);
    
      row.merge(rowEnter).selectAll("text.pt-id.row-label")
          .style("fill", function(d) { return nodes[d.y].group !== null ? c(nodes[d.y].group) : '#ccc'; });
    
      row.merge(rowEnter).transition().duration(TRANSITION_DURATION).delay(function(d) { return x(d.y) * 1; })
          .attr("transform", function(d) { return "translate(0," + x(d.y) + ")"; })
          .attr("opacity", 1);

      row.exit().transition().duration(TRANSITION_DURATION)
          .attr("opacity", 0)
          .remove();
      row.exit().selectAll(".cell").interrupt();
    }
    
    function tipHtml(d) {
      var tipRows = {
            eRAP_ID: "Anon Pt ID",
            collection_unit: "Unit",
            ordered: "Order Date",
            mlst_subtype: "MLST", 
            isolate_ID: "Isolate ID",
            assembly_ID: "Assembly ID",
            contig_count: "# contigs",
            contig_N50_format: 'contig N50',
            contig_maxlength_format: 'longest contig'
          },
          ixLeft = d.y,  // node index for left side of tooltip table
          ixRight = d.x, // "" for right side
          leftClust = nodes[ixLeft].samePtMergeParent,
          rightClust = nodes[ixRight].samePtMergeParent,
          html = '<table class="link-info">'
          + '<tr><th class="row-label">Distance</th><th class="dist" colspan=2><span class="dist-value">' + d.z + '</span> SNPs</th></tr>',
          snvs_url;
      
      // For each side of the tooltip table, if it is a merged isolate, display info for the *closest* isolate.
      if (leftClust) {
        ixLeft = _.first(_.sortBy(leftClust, function(i) { 
          var cell = fullMatrix[i][d.x];
          return cell.origZ !== null ? cell.origZ : cell.z; 
        }));
      }
      if (rightClust) {
        ixRight = _.first(_.sortBy(rightClust, function(i) { 
          var cell = fullMatrix[d.y][i];
          return cell.origZ !== null ? cell.origZ : cell.z;
        }));
      }
      if (leftClust || rightClust) {
        html += '<tr class="merge"><td/><td>' + (leftClust ? 'MERGED' : '') + '</td><td>' + (rightClust ? 'MERGED' : '') + '</td></tr>';
      }
      
      _.each(tipRows, function(label, k) {
        var val1 = nodes[ixLeft][k],
            val2 = nodes[ixRight][k],
            link;
        if (PREPROCESS_FIELDS && PREPROCESS_FIELDS[k]) { val1 = PREPROCESS_FIELDS[k](val1); val2 = PREPROCESS_FIELDS[k](val2); }
        html += '<tr><td class="row-label">' + label + '</td>';
        if (LINKABLE_FIELDS && (link = LINKABLE_FIELDS[k])) {
          val1 = '<a target="_blank" href="' + link.replace('%s', encodeURIComponent(val1)) + '">' + val1 + '</a>';
          val2 = '<a target="_blank" href="' + link.replace('%s', encodeURIComponent(val2)) + '">' + val2 + '</a>';
        }
        if (val1 == val2) { html += '<td class="same" colspan=2>' + val1 + '</td></tr>'; }
        else { html += '<td>' + val1 + '</td><td>' + val2 + '</td></tr>'; }
      });
      
      html += '</table>'
      if (leftClust || rightClust) { html += '<div class="merge-warn">For merged isolates, closest isolate is shown.</div>'; }
      html += '<div class="more"><span class="instructions">click for links</span><span class="links">Open: ';
      snvs_url = assemblies.out_dir + '/' + nodes[ixLeft].name + '/' + nodes[ixLeft].name + '_' + nodes[ixRight].name + '.snv.bed',
      snvs_url = (TRACKS_DIR || 'data/') + snvs_url;
      if (IGB_DIR && CHROMOZOOM_URL && TRACKS_DIR) {
        snvs_url = CHROMOZOOM_URL.replace('%s', IGB_DIR + nodes[ixLeft].name) + '&customTracks=' + snvs_url;
        snvs_url += '';
      }
      html += '<a href="' + snvs_url + '" target="_blank">SNP track</a> <a href="javascript:alert(\'coming soon\')">mummerplot</a>';
      html += '</span></div>';
      return html;
    }
    
    var tip = d3.tip()
        .attr('class', 'd3-tip')
        .offset([-10, 0])
        .html(tipHtml);
    var selectedCell = null; 
    
    svg.call(tip);
    svg.on("click", function() { deselectCell(); tip.hide(); });

    function updateRowCells(rowData) {
      var cell = d3.select(this).selectAll("rect")
          .data(_.filter(rowData, function(d) { return d.z < MAX_SNP_THRESHOLD; }), cellKeying);
      deselectCell();
      tip.hide();
    
      var cellEnter = cell.enter().append("rect")
          .attr("class", "cell")
          .classed("same-pt", function(d) { return nodes[d.x].eRAP_ID == nodes[d.y].eRAP_ID; })
          .attr("x", function(d) { return x(d.x) + cellPadding(d); })
          .attr("y", function(d) { return cellPadding(d); })
          .style("stroke", cellStrokeColor)
          .attr("fill", cellColor)
          .attr("opacity", 0)       // All cells start out transparent and fade in
          .on("mouseover", function(d) { 
            if (!cellClickable(d)) { return; }
            if (!selectedCell) { tip.show(d); }
            mouseover(d);
          })
          .on("click", function(d) { 
            if (selectedCell !== this && cellClickable(d)) { selectCell(d, this); tip.show(d); }
            else { deselectCell(); tip.hide(d); }
            d3.event.stopPropagation();
          })
          .on("mouseout", function(d) { 
            if (!selectedCell) { tip.hide(d); } 
            mouseout(d);
          })
      
      cell.merge(cellEnter).classed("clickable", cellClickable);
      
      cell.merge(cellEnter).transition().duration(TRANSITION_DURATION).delay(function(d) { return x(d.x) * 1; })
          .attr("x", function(d) { return x(d.x) + cellPadding(d); })
          .attr("width", function(d) { return x.bandwidth() - cellPadding(d) * 2; })
          .attr("height", function(d) { return x.bandwidth() - cellPadding(d) * 2; })
          .style("stroke", cellStrokeColor)
          .attr("fill", cellColor)
          .attr("opacity", function(d) { return z(d.z); });
    
      cell.exit().transition().duration(TRANSITION_DURATION)
          .attr("opacity", 0)
          .remove();       
    }

    function mouseover(p) {
      d3.selectAll(".row").classed("active", function(d) { return d.y == p.y || d.y == p.x; });
      d3.selectAll(".column").classed("active", function(d) { return d.y == p.x || d.y == p.y; });
      d3.selectAll(".cell").classed("active", function(d) { return d.y == p.y && d.x == p.x; });
    }

    function mouseout() {
      d3.selectAll(".active").classed("active", false);
    }
    
    function selectCell(d, elem) {
      selectedCell = elem;
      selectedCellReticle
          .attr("x", x(d.x) - 1)
          .attr("y", x(d.y) - 1)
          .attr("width", x.bandwidth() + 2)
          .attr("height", x.bandwidth() + 2)
          .attr("visibility", "visible");
      tip.attr('class', tip.attr('class').replace(/\s+show-more(\s)+/g, '$1') + ' show-more');
    }
    
    function deselectCell() {
      selectedCell = null;
      selectedCellReticle.attr("visibility", "hidden");
      tip.attr('class', tip.attr('class').replace(/\s+show-more(\s)+/g, '$1'));
    }
    
    function interruptAllTransitions() {
      svg.selectAll("*").interrupt();
    }
    
    // ******************************* CLUSTER LEGEND **************************************
    
    var clusterLegend = d3.select("#cluster-legend");
    function updateClusters(clusters) {
      clusterLegend.style('display', 'inline');
      clusterLegend.select('.num-clusters').text(clusters.length);
      var clusterList = clusterLegend.select('#cluster-list').selectAll('span').data(clusters);
      var clusterEnter = clusterList.enter().append('span');
      clusterList.merge(clusterEnter)
          .style("background-color", function(d, i) { return c(i); } )
          .text(function(d) { return d.index.length; });
      clusterList.exit().remove();
    }
    updateClusters(filteredClusters);
    
    // ************************* BIND UI EVENTS -> CALLBACKS *******************************
    
    $("#order").on("change", function() { reorder(); });
    $('#db').on('change', function() { window.location.search = '?db=' + $(this).val(); });
    
    var mlsts = _.reject(_.map(_.pluck(nodes, 'mlst_subtype'), function(v) { return parseInt(v, 10); }), _.isNaN);
    _.each(_.sortBy(_.uniq(mlsts)), function(mlst) { 
      $('#mlsts').append('<option value="MLST:' + mlst + '">MLST: ' + mlst + '</option>'); 
    });
    var units = _.pluck(nodes, 'collection_unit');
    _.each(_.sortBy(_.compact(_.uniq(units))), function(unit) { 
      $('#units').append('<option value="Unit:' + unit + '">Unit: ' + unit + '</option>'); 
    });
    $('#filter').select2({placeholder: "Click to add/remove filters"})
    $('#filter-cont .select2-selection').append(
        '<span class="select2-selection__arrow" role="presentation"><b role="presentation"></b></span>');
    $('#filter').on('change', changeSnpThreshold);
    
    // The SNP threshold input then calls the changeSnpThreshold function for updating the viz
    $('#snps-num').on('change', changeSnpThreshold);

    // **************************** UPDATING DATA -> UI ************************************

    function reorder() {    
      var orderedNodeIndexes = calculateOrder($('#order').val());
                
      filteredDomain = filterOrderByBrush(filterOrderByVisibleNodes(orderedNodeIndexes));
      // filter the fullMatrix to only the rows and columns in the filteredDomain
      filteredMatrix = _.map(
        _.filter(fullMatrix, function(col) { return _.contains(filteredDomain, col.y); }), 
        function(col, i) { 
          var nodeIndex = col.y,
            newCol = _.filter(col, function(cell) { return _.contains(filteredDomain, cell.x); });
          newCol.y = nodeIndex;
          return newCol;
        }
      );
     
      x.domain(filteredDomain).range([0, Math.min(idealBandWidth * filteredDomain.length, width)]);

      updateColumns(filteredMatrix);
      updateRows(filteredMatrix);

      // t.selectAll(".row .bg")
      //     .attr("class", function(d, i) { return _.contains(filteredDomain, i) ? "selected bg" : "bg"; });
      // t.selectAll(".column .bg")
      //     .attr("class", function(d, i) { return _.contains(filteredDomain, i) ? "selected bg" : "bg"; });
    }
  
    function changeSnpThreshold() {
      interruptAllTransitions();
      var snpThreshold = parseInt($('#snps-num').val(), 10);
      calculateMatrixAndVisibleNodes(nodes, links, snpThreshold, getFilters());
    
      z.domain([snpThreshold + 1, 0]);
    
      reorder();
      updateNodes(visibleNodes);
      updateClusters(filteredClusters);
    }
  
    // kick off an initial data update to setup the UI
    brush.move(brushg, [width * 0.6, width * 0.8]);
    
  });
  
});

</script>

<?php includeAfterBody(); ?>

</body>
</html>