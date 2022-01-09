// ****************************************************************************
// ****************************************************************************
//
// This code is part of PathoSPOT-visualize; see https://pathospot.org/
// This JavaScript supports the `heatmap` and `network map` views of 
// the PathoSPOT-visualize toolkit.
//
// Primary dependencies are D3.js, Underscore.js, and jQuery.
//
// (c) 2020 Theodore Pak. MIT licensed; see LICENSE.txt 
//
// ****************************************************************************
// ****************************************************************************


$(function() { 
  // *************************** SVG/D3 SETUP *********************************

  var margin = {top: 60, right: 400, bottom: 10, left: 80, networkTop: 30},
      networkMargin = {top: 15, topPad: 30}
      width = 600,
      height = 600,
      sliderHeight = 80,
      dendroRight = 140,
      DEFAULT_SNP_THRESHOLD = parseInt($('#snps-num').val(), 10),
      MAX_SNP_THRESHOLD = 100,
      MIN_SNP_THRESHOLD = 1,
      TRANSITION_DURATION = 1000,
      ANIM_TRANSITION_DURATION = 200,
      REDRAW_INTERVAL = 1000,
      IDEAL_LABEL_HEIGHT = 16,
      MIN_LABEL_HEIGHT = 8,
      HOSPITAL_MAP = window.HOSPITAL_MAP || 'anon-hospital-gray',
      DATA_DIR = window.DATA_DIR || 'data',
      $LOADING_SPINNER = $('.loading'),
      $LOADING_SPINNER_TEXT = $('.loading-text');
  
  // Specifies URL query parameters that should map to DOM element values
  //     (see `syncQueryParamsToDOM` in utils.js for more details)
  // Some of the parameters have `false` getterSetters as they can only be defined and activated
  //     later on in the initial load process, or have special behavior
  var queryParamSpec = {db: false, filter: true, snps: true, order: true, range: false, 
          mode: false, play: false},
      syncDOMToQueryParamsDebounced = _.debounce(syncDOMToQueryParams, 200);
  
  // Utility functions for formatting various fields for display.
  var FORMAT_FOR_DISPLAY = {
        collection_unit: fixUnit,
        hospitalAndUnit: fixUnit,
        ordered: formatDate,
        group: formatClusterNumber,
        coreGenomeSize: formatPercentages,
        clusterCoverageRange: formatPercentages,
        "% patients clustered": formatPercentages,
        "% isolates clustered": formatPercentages,
        "Core genome size range": formatPercentages,
        "Cluster coverage range": formatPercentages,
        "Core genome": formatPercentages,
        "Cluster coverage": formatPercentages
      };
  
  window.ANON = getURLParameter('anon');
  window.rand20 = Math.floor(Math.random() * 20);
  
  var x = d3.scaleBand().range([0, width]),
      z = d3.scaleLinear().domain([DEFAULT_SNP_THRESHOLD + 1, 0]).clamp(true),
      c = d3.scaleOrdinal(d3.schemeCategory10.swap(0, 3)).domain(d3.range(10));

  var svg = d3.select("body").append("svg")
      .attr("id", "main-viz")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
  
  var heatmapG = svg.append("g")
      .attr("class", "main-view heatmap")
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
      
  var networkG = svg.append("g")
      .attr("class", "main-view network")
      .attr("transform", "translate(0," + (networkMargin.top + networkMargin.topPad) + ")")
      .style("display", "none");
  
  $("#epi-heatmap")
      .css("margin-top", networkMargin.top)
      .css("padding-top", networkMargin.topPad)
      .css("height", height + margin.top + margin.bottom - networkMargin.top - networkMargin.topPad);
  
  $('#epi-heatmap > .cont')
      .css("width", width + margin.left + margin.right)
      .css("height", height + margin.top + margin.bottom - networkMargin.top - networkMargin.topPad)
      .css("background-image", 'url(maps/' + HOSPITAL_MAP + '.png)');
  
  // The db <select> input requires special setup because all further UI depends on the dataset it selects
  var db = (getURLParameter('db') || $('#db').val()).replace(/[^\w_.-]+/g, '');
  $('#db').val(db);
  var EPI_FILE = $('#db > option:selected').data('epi');
  document.title = $('#db > option[value="'+ db +'"]').text() + ' - Heatmap';

  // ************************** FIRST, FETCH THE DISTANCES MATRIX ****************************

  d3.json(DATA_DIR + "/" + db + ".heatmap.json", function(assemblies) {

    var nodes = assemblies.nodes,
        links = _.isArray(assemblies.links[0]) ? [] : assemblies.links,
        // In .parsnp.heatmap.json files, the (cleaned) parsnp Newick trees are included.
        trees = assemblies.trees; 
        
    // Unpack nodes and links, which may be compressed into array-of-array format
    if (_.isArray(nodes[0])) { nodes = tabularIntoObjects(nodes); }
    if (!links.length) {
      _.each(assemblies.links, function(row, i) {
        _.each(row, function(cell, j) { 
          cell !== null && i !== j && links.push({source: i, target: j, value: cell}); 
        });
      });
    }
    
    var n = nodes.length,
        idealBandWidth = Math.max(width / n, IDEAL_LABEL_HEIGHT),
        rowLimitForLabels = Math.floor(width / MIN_LABEL_HEIGHT),
        rowLimitForLines = Math.floor(width / 4),
        g = width / 3,
        filteredDomain = [],
        unitCoords = {"": [0, 0]},
        epiData = {isolates: []},
        brushAnimateStatus = null,
        nodesToTrees = {},
        treeSizes = [],
        parsnpStats = assemblies.parsnp_stats,
        detectedClusters = [],
        fullMatrix, visibleNodes, clusterableNodes;
    
    $('.distance-unit').text(assemblies.distance_unit);
    
    // If we have Newick trees from parsnp, create a map from node names to the tree it was included in
    trees && _.each(trees, function(tree, i) {
      var numerical = (/^\d+(\.\d+(e[+-]\d+)?)?$/),
          nodesInTree = _.reject(tree.split(/[():,;]+/), function(token) { return !token || numerical.test(token); });
      _.each(nodesInTree, function(node) { nodesToTrees[node] = i; });
      treeSizes.push(nodesInTree.length);
    });
  
    // **************************  LOAD AND SETUP DATA STRUCTURES *****************************
  
    // The following critical function recalculates and DESTRUCTIVELY modifies the following globals above
    // `nodes`: the full list of nodes
    // `fullMatrix`: the full distance matrix
    // `visibleNodes`: which nodes should show up in the daterange selector and in the matrix based on `filters`
    // `clusterableNodes`: the subset of `visibleNodes` that can be clustered (≥1 link under the `snpThreshold`)
    // `detectedClusters`: the clusters that were detected in `clusterableNodes`
    // 
    // The parameter `filters` is an object with the following possible keys:
    //   `mergeSamePt: true` will merge nodes with the same eRAP_ID
    //   `clustersOnly: true` will hide nodes that don't have any matching nodes above snpThreshold
    //   `mlst_subtype: ['1', '4', ...]` will show only nodes that have these `.mlst_subtype`s
    //   `hospitalAndUnit: ['MSH MICU', ...]` will show only nodes that have these `.hospitalAndUnit`s
    
    function calculateMatrixAndNodeSubsets(nodes, links, snpThreshold, filters) {
      var matrix = [],
        samePtClusters = [],
        allClusters;
      
      $LOADING_SPINNER_TEXT.text('reclustering genomes');
      filters = _.extend({}, filters);
    
      // Reset the nodes array and initialize the rows of the matrix, which is in matrix[y][x] orientation
      _.each(nodes, function(node, i) {
        node.i = i;
        node.count = 0;
        node.group = null;
        node.groupOrder = null;
        node.groupSize = null;
        node.samePtMergeParent = false;
        node.samePtMergeChild = false;
        node.mlst_subtype = node.mlst_subtype == "No Match" ? "??" : node.mlst_subtype;
        if (_.isUndefined(node.ordered)) {
          node.ordered = null;
          if ((/\d{4}-\d{2}-\d{2}/).test(node.order_date) && node.order_date > '1901-00-00') { 
            node.ordered = new Date(node.order_date);
            if (ANON) { node.ordered = node.ordered.setMonth(node.ordered.getMonth() + rand20 + 10); }
          }
        }
        if (_.isUndefined(node.hospitalAndUnit)) {
          node.hospitalAndUnit = getHospitalAndUnit(node);
        }
        if (_.isUndefined(node.contig_N50_format)) {
          node.contig_N50_format = numberWithCommas(node.contig_N50);
          node.contig_maxlength_format = numberWithCommas(node.contig_maxlength);
        }
        if (_.isUndefined(node.whichTree) && !_.isUndefined(nodesToTrees[node.name])) { 
          node.whichTree = nodesToTrees[node.name];
          if (parsnpStats && parsnpStats[node.whichTree]) {
            node.coreGenomeSize = parsnpStats[node.whichTree].core_genome_size
            node.clusterCoverageRange = parsnpStats[node.whichTree].cluster_coverage_range
          }
        }
        matrix[i] = d3.range(n).map(function(j) { return {x: j, y: i, z: i == j ? 0 : Infinity, origZ: null}; });
        matrix[i].y = i;
      });

      // Convert links to matrix, WHILE detecting same-patient clusters if they need to be merged
      // Clustering for the purposes of merging here is done via a single-linkage criterion
      _.each(links, function(link) {
        var sourceClusterIndex, targetClusterIndex;
        if (link.value === null) { return; }
        if (matrix[link.source][link.target].z !== Infinity) {
          return console.warn("Duplicate link between " + nodes[link.source] + " and " + nodes[link.target]);
        }
        matrix[link.source][link.target].z = link.value;
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
                samePtClusters[sourceClusterIndex] = samePtClusters[sourceClusterIndex].concat(samePtClusters[targetClusterIndex]);
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
      
      // Here, `filters` are successively applied to `nodes` to determine `visibleNodes`
      visibleNodes = _.reject(nodes, function(node) { return node.samePtMergeChild; });
      if (filters.clustersOnly) { 
        visibleNodes = _.reject(visibleNodes, function(node) { return node.count <= 0; }); 
      }
      _.each(['mlst_subtype', 'hospitalAndUnit'], function(field) {
        if (filters[field] && filters[field].length) {
          visibleNodes = _.filter(visibleNodes, function(node) { return _.contains(filters[field], node[field]); }); 
        }
      });
      
      // We only need to cluster `nodes` that have at least one link below snpThreshold
      // All other nodes could not possibly be within any clusters, and only waste time during `HClust.agnes` below
      clusterableNodes = _.filter(visibleNodes, function(node) {
        var i = node.i,
          linkInRow = _.find(matrix[node.i], function(cell, j) { return i != j && cell.z <= snpThreshold; }),
          linkInCol = _.find(matrix, function(col, j) { return i != j && col[i].z <= snpThreshold; });
        return linkInRow || linkInCol;
      });
    
      if (clusterableNodes.length) {
        // Agglomerative, single-linkage hierarchical clustering based on the above dissimilarity matrix
        // Hierarchical clustering expects symmetrical distances, so we average across the diagonal of the dissimilarity matrix
        function disFunc(a, b) { 
          return (matrix[a.i][b.i].z + matrix[b.i][a.i].z) / 2;
        }
        allClusters = HClust.agnes(clusterableNodes, {disFunc: disFunc, kind: 'single'});
        
        // Find all clusters with diameter below the snpThreshold with >1 children
        allClusters = _.filter(allClusters.cut(snpThreshold), function(clust) { return clust.children; });
        // Sort them by size, in descending order
        detectedClusters = _.sortBy(allClusters, function(clust) { return -clust.index.length; });
        // then annotate the nodes with the # of the cluster they are in.
        // We also track the size of each cluster including `mergeSamePt` children in order to warn the user if this is 
        // bumping up against the largest mash precluster size.
        _.each(detectedClusters, function(clust, i) {
          clust.sizeIncludingSamePtChildren = 0;
          _.each(clust.index, function(leaf) {
            clusterableNodes[leaf.index].group = i;
            clusterableNodes[leaf.index].groupSize = clust.index.length;
            var samePtMergeParent = clusterableNodes[leaf.index].samePtMergeParent;
            clust.sizeIncludingSamePtChildren += samePtMergeParent ? samePtMergeParent.length : 1;
          });
        });
      }
    
      fullMatrix = matrix;
    }
    calculateMatrixAndNodeSubsets(nodes, links, DEFAULT_SNP_THRESHOLD, getFilters('#filter'));


    // ************************* FILTERING AND ORDERING *****************************
  
    function calculateOrder(indices, orderMethod) {
      switch (orderMethod) {
        case 'groupOrder':
          return indices.sort(function(a, b) { return nodes[b].groupOrder - nodes[a].groupOrder; });
        case 'order_date':
          return indices.sort(function(a, b) { 
            return d3.ascending(nodes[a].order_date, nodes[b].order_date)
                || d3.ascending(nodes[a].groupOrder, nodes[b].groupOrder);
          });
        case 'hospitalAndUnit':
          return indices.sort(function(a, b) {
            return d3.ascending(nodes[a].hospitalAndUnit, nodes[b].hospitalAndUnit)
                || d3.ascending(nodes[a].groupOrder, nodes[b].groupOrder);
          });
        case 'mlst_subtype':
          return indices.sort(function(a, b) { 
            return d3.ascending(nodes[a].mlst_subtype, nodes[b].mlst_subtype)
                || d3.ascending(nodes[a].groupOrder, nodes[b].groupOrder);
          });
        case 'eRAP_ID':
          return indices.sort(function(a, b) { return d3.ascending(nodes[a].eRAP_ID, nodes[b].eRAP_ID); });
      }
    }
    
    // Filters a set of indices by whether the node was merged into a similar node
    // from the same patient (if it was, it is removed)
    function filterByVisibleNodes(indices) {
      var visibleNodeIndices = {};
      _.each(visibleNodes, function(node) { visibleNodeIndices[node.i] = true; });
      return _.filter(indices, function(i) { return visibleNodeIndices[i]; });
    }

    // Filters a set of indices by the current date range brush selection.
    // By default, it will assume the indices point to `nodes`, but `what` can be set to override this.
    function filterByBrush(indices, what) {    
      var selection = d3.brushSelection(brushG.node()),
        start, end;
      what = what || nodes;
        
      if (selection === null) { return indices; }
      start = sliderX.invert(selection[0]);
      end = sliderX.invert(selection[1]);
      return _.filter(indices, function(i) { return what[i].ordered >= start && what[i].ordered <= end; });
    }
    
    
    // ***************************** BRUSH SLIDER ************************************
    
    var orderDates = _.compact(_.pluck(nodes, "ordered"));
    
    var sliderG = d3.select("#controls").append("svg")
        .attr("id", "beeswarm-slider-histogram")
        .attr("width", width + margin.left + margin.right)
        .attr("height", sliderHeight + 20)
        .append("g")
        .attr("class", "sliderBeeswarm")
        .attr("transform", "translate(" + margin.left + ",0)");
    
    var sliderX = d3.scaleTime().domain([_.min(orderDates), _.max(orderDates)]).nice().range([0, width]);
    var sliderY = d3.randomNormal(sliderHeight / 2, sliderHeight / 8);  

    var brush = d3.brushX()
        .extent([[0, 0], [width, sliderHeight - 1]])
        .on("brush", function(e) { return (brushAnimateStatus !== null) && brushMove(e); })
        .on("end", brushEnd);
    
    sliderG.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0," + sliderHeight + ")")
        .call(d3.axisBottom().scale(sliderX));
    
    sliderG.append("g")
        .attr("class", "beeswarm");
    
    // Applies quadratic penalties for points being laid out more than 1px horizontally from their correct
    // position, and anywhere outside the upper/lower boundaries of the slider.
    function calculateLayoutBadness(nodes, sliderX, sliderHeight) {
      var badness = 0, xTolerance = 1, nodesChecked = 0;
      _.each(nodes, function(node) {
        if (!node.ordered) { return; }
        nodesChecked += 1;
        var clipX = Math.abs(node.x - sliderX(node.ordered));
        if (clipX > xTolerance) { badness += (clipX - xTolerance) * (clipX - xTolerance); }
        var clipY = Math.abs(node.y - sliderHeight / 2);
        if (clipY > sliderHeight / 2) { badness += (clipY - sliderHeight / 2) * (clipY - sliderHeight / 2); }
      });
      return badness / nodesChecked;
    }
  
    function updateNodes(filteredNodes) {
      var possibleRadii = [4.0, 3.0, 2.5, 2.0, 1.5, 1.0, 0.8, 0.6], threshold = 3.0, radius, simulation;
      
      while (possibleRadii.length) {
        radius = possibleRadii.shift();
        simulation = d3.forceSimulation(filteredNodes)
            .force("x", d3.forceX(function(d) { return d.ordered ? sliderX(d.ordered) : -1000; }).strength(1))
            .force("y", d3.forceY(sliderHeight / 2))
            .force("collide", d3.forceCollide(radius + 0.5))
            .stop();
        
        for (var i = 0; i < 120; ++i) { simulation.tick(); }
        if (calculateLayoutBadness(filteredNodes, sliderX, sliderHeight) < threshold) { break; }
      }

      var circle = sliderG.select("g.beeswarm").selectAll("circle")
          .attr("title", function(d) { return d.order_date; })
          .data(filteredNodes, function(d) { return d.i; });
    
      var circleEnter = circle.enter().append("circle");

      circleEnter.merge(circle)
          .attr("r", radius)
          .attr("visibility", function(d) { return d.ordered ? "visible" : "hidden"; })
          .attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")"; })
          .attr("class", function(d) { return d.count > 0 ? 'transmission' : '' })
          .classed("selected", function(d) { return _.contains(filteredDomain, d.i); })
          .style("stroke", function(d) { return d.group !== null ? c(d.group) : null })
          .style("fill", function(d) { return d.count > 0 && d.group !== null ? c(d.group) : null });
          
      circle.exit().remove();
    }
    updateNodes(visibleNodes);

    var brushG = sliderG.append("g")
        .attr("class", "brush")
        .call(brush);

    function brushMove(event) {
      var now = (+new Date);
      if (brushAnimateStatus !== null) {
        if (now - brushAnimateStatus.lastRefresh < REDRAW_INTERVAL) { return; }
        brushAnimateStatus.lastRefresh = now;
      }
      
      interruptAllTransitions();
      reorder();
      sliderG.select("g.beeswarm").selectAll("circle")
        .classed("selected", function(d) { return _.contains(filteredDomain, d.i); });
    }

    function brushEnd(event) {
      return brushMove(event);
    }
    
    function brushVal(range) {
      if (range && _.isArray(range) && range.length >= 2) {
        brush.move(brushG, [width * parseFloat(range[0]), width * parseFloat(range[1])]);
      }
      return _.map(d3.brushSelection(brushG.node()), function(x) { return x / width; });
    }
    
    // Provides a setter so that the query parameter `range` will be bound to the brush selection
    queryParamSpec.range = brushVal;
    

    // ******************************* HISTOGRAM *************************************

    var histoMargin = {top: 6, left: 50, right: 40, bottom: 20},
        histoHeight = sliderHeight - histoMargin.top,
        histoWidth = margin.right - histoMargin.left - histoMargin.right,
        lowestBinWidth = histoWidth * 0.045;

    var histoX = d3.scaleLog()
        .rangeRound([lowestBinWidth, histoWidth]);
    
    var histoY = d3.scaleLinear()
        .range([sliderHeight - histoMargin.top, 0]);
            
    var histoG = d3.select("#beeswarm-slider-histogram").append("g")
        .attr("class", "histo")
        .attr("transform", "translate(" + (width + margin.left + histoMargin.left) + "," + histoMargin.top + ")");
    
    var histoXAxis = histoG.append("g")
        .attr("class", "axis axis--x")
        .attr("transform", "translate(0," + histoHeight + ")");
    
    var histoYAxis = histoG.append("g")
        .attr("class", "axis axis--y");
        
    var histoGBars = histoG.append("g");
    
    histoG.append("text")
        .attr("x", histoWidth)
        .attr("y", 0)
        .attr("dy", ".32em")
        .attr("text-anchor", "end")
        .attr("fill", "#777")
        .text("Any previous isolate")
    histoG.append("text")
        .attr("x", histoWidth)
        .attr("y", 10)
        .attr("dy", ".32em")
        .attr("text-anchor", "end")
        .text("Same-patient isolate")
    
    histoG.append("line")
        .attr("class", "histo-cutoff")
        .attr("y1", 0)
        .attr("y2", histoHeight)
    
    histoG.append("rect")
        .attr("class", "histo-bg")
        .attr("width", histoWidth)
        .attr("height", histoHeight)
        .call(d3.drag()
            .on("start drag", function() { 
              $LOADING_SPINNER.show();
              $('#snps').val(Math.round(histoX.invert(d3.event.x))).trigger("change", true);
              changeSnpThresholdDebounced();
            })
        );
    
    function updateHistoBars(mat) {
      var allDistances = [], samePtDistances = [];
      _.each(mat, function(row, i) {
        if (nodes[i].ordered === null) { return; }
        var previousIsolates = _.filter(row, function(cell, j) {
          // exclude diagonal, only allow comparisons with chronologically previous isolates
          return i !== j && nodes[j].ordered !== null && nodes[j].ordered <= nodes[i].ordered;
        });
        var samePtIsolates = !nodes[i].eRAP_ID ? [] : _.filter(previousIsolates, function(cell) {
          // exclude diagonal, only allow comparisons with chronologically previous isolates
          return nodes[cell.x].eRAP_ID == nodes[i].eRAP_ID;
        });
        function origZ(cell) { return cell.origZ !== null ? cell.origZ : cell.z; }
        if (previousIsolates.length) { allDistances.push(d3.min(_.map(previousIsolates, origZ))); }
        if (samePtIsolates.length) { samePtDistances.push(d3.min(_.map(samePtIsolates, origZ))); }
      });
      
      allDistances = _.filter(allDistances, function(x) { return _.isFinite(x) }); 
      samePtDistances = _.filter(samePtDistances, function(x) { return _.isFinite(x); });
      histoX.domain([MIN_SNP_THRESHOLD, d3.max(allDistances) * 1.04]);
      
      var log10Scale = d3.scaleLinear().domain([Math.log10(MIN_SNP_THRESHOLD), Math.log10(d3.max(allDistances))]).ticks(20),
          thresholds = _.map(log10Scale, function(x) { return Math.pow(10, x); });
          
      var binning = d3.histogram()
          .domain(histoX.domain())
          .thresholds(thresholds)
      
      var binAllDistances = binning(allDistances),
          binSamePtDistances = binning(samePtDistances);
      
      // Add special bins for values below the minimum distance
      binAllDistances.unshift(_.filter(allDistances, function(d) { return d < MIN_SNP_THRESHOLD; }))
      _.extend(binAllDistances[0], {x0: -Infinity, x1: MIN_SNP_THRESHOLD});
      binSamePtDistances.unshift(_.filter(samePtDistances, function(d) { return d < MIN_SNP_THRESHOLD; }))
      _.extend(binSamePtDistances[0], {x0: -Infinity, x1: MIN_SNP_THRESHOLD});
      
      _.each(binSamePtDistances, function(bin) { bin.samePt = true; });
      var bins = binAllDistances.concat(binSamePtDistances);
            
      histoY.domain([0, d3.max(bins, function(d) { return d.length; })])

      var histoBar = histoGBars.selectAll(".bar")
          .data(bins);

      var histoBarEnter = histoBar.enter().append("g")
          .attr("class", "bar")
      
      histoBarEnter.append("rect");

      histoBarEnter.merge(histoBar)
          .attr("transform", function(d) { 
            return "translate(" + (_.isFinite(d.x0) ? histoX(d.x0) : 1) + "," + histoY(d.length) + ")"; 
          })
        .select("rect")
          .attr("x", 1)
          .attr("width", function(d) {
            return (_.isFinite(d.x0) ? histoX(d.x1) - histoX(d.x0) : lowestBinWidth - 1) - 1; 
          })
          .attr("height", function(d) { return histoHeight - histoY(d.length); })
          .classed("same-pt", function(d) { return d.samePt; });

      histoBar.exit().remove();
      
      histoXAxis.call(d3.axisBottom(histoX).ticks(5, ",.1s"));
      histoYAxis.call(d3.axisLeft(histoY).ticks(3, ",s"));
    }
    updateHistoBars(fullMatrix);
    
    function updateHistoCutoff(cutoff) {
      histoG.select(".histo-cutoff").attr("x1", histoX(cutoff)).attr("x2", histoX(cutoff));
    }
    updateHistoCutoff(DEFAULT_SNP_THRESHOLD);
    
  
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
    function cellStrokeWidth(d, n) {
      if (nodes[d.x].eRAP_ID == nodes[d.y].eRAP_ID && d.x != d.y) { 
        return n > rowLimitForLabels ? (width / n / 4) : 2; 
      }
      return 2;
    }
    function cellPadding(d, n) {
      if (nodes[d.x].eRAP_ID == nodes[d.y].eRAP_ID && d.x != d.y) {
        return (n > rowLimitForLabels) ? (width / n / 8) : 1.5;
      }
      if (n > rowLimitForLines) { return 0; }
      return 0.5;
    }
    function cellClickable(d) {
      return d.z < z.domain()[0] && d.x != d.y;
    }
    
    // background and axis/table labels
        
    heatmapG.append("rect")
        .attr("class", "background")
        .attr("width", width)
        .attr("height", height)
    var rowsColsG = heatmapG.append("g").attr("class", "rows-cols");
    
    var axisLabelPos = [-6, width + 6, width + 100, width + 170, width + 210];
    var axisLabels = {"Anon Pt ID": axisLabelPos[0], "Unit": axisLabelPos[1], "Order Date": axisLabelPos[2], 
                      "MLST": axisLabelPos[3], "Isolate ID": axisLabelPos[4]};
    _.each(axisLabels, function(xPos, label) {
      heatmapG.append("text")
          .attr("class", "axis-label axis-label-expanded")
          .attr("x", xPos)
          .attr("y", -10)
          .attr("dy", ".32em")
          .attr("text-anchor", xPos < 0 ? "end" : "start")
          .text(label);
    });
    
    var selectedCellReticle = heatmapG.append("rect")
        .attr("class", "selected-cell")
        .attr("visibility", "hidden");
        
    // functions for updating rows/columns of the heatmap

    function updateColumns(matrix) {
      var transitionDuration = brushAnimateStatus !== null ? ANIM_TRANSITION_DURATION : TRANSITION_DURATION;
      var columnExtraClasses = (matrix.length > rowLimitForLabels ? " no-labels" : "") +
          (matrix.length > rowLimitForLines ? " no-lines" : "");
      
      heatmapG.classed("hide-axis-labels", matrix.length > rowLimitForLabels);
          
      var column = rowsColsG.selectAll("g.column")
          .data(matrix, columnKeying);

      var columnEnter = column.enter().append("g")
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

      column.merge(columnEnter)
          .attr("class", "column" + columnExtraClasses)
        .transition().duration(transitionDuration).delay(function(d, i) { return x(d.y) * 1; })
          .attr("transform", function(d) { return "translate(" + x(d.y) + ")rotate(-90)"; })
          .attr("opacity", 1)
        .selectAll("text.col-label")
          .style("fill", function(d) { return nodes[d.y].group !== null ? c(nodes[d.y].group) : '#ccc'; });

      column.exit().transition().duration(transitionDuration)
          .attr("opacity", 0)
          .remove(); 
    }

    function updateRows(matrix) {
      var transitionDuration = brushAnimateStatus !== null ? ANIM_TRANSITION_DURATION : TRANSITION_DURATION;
      var rowExtraClasses = (matrix.length > rowLimitForLabels ? " no-labels" : "") +
          (matrix.length > rowLimitForLines ? " no-lines" : "");
      
      var row = rowsColsG.selectAll("g.row")
          .data(matrix, columnKeying);
      // Defines the columns of metadata that show up to the right of the heatmap per row.
      var rowTextSpec = {
            "row-label pt-id": {x: axisLabelPos[0], fn: function(d) { return nodes[d.y].eRAP_ID; }},
            "unit": {x: axisLabelPos[1], fn: function(d) { return fixUnit(nodes[d.y].hospitalAndUnit); }},
            "date": {x: axisLabelPos[2], fn: function(d) { return formatDate(nodes[d.y].ordered); }},
            "mlst": {x: axisLabelPos[3], fn: function(d) { return nodes[d.y].mlst_subtype; }},
            "isolate-id row-label": {
              x: axisLabelPos[4], 
              fn: function(d) { 
                return nodes[d.y].samePtMergeParent ? "MERGED" : nodes[d.y].isolate_ID; 
              }
            }
          };
        
      var rowEnter = row.enter().append("g")
          .attr("transform", function(d) { return "translate(0," + x(d.y) + ")"; })
          .attr("opacity", 0);
      rowEnter.append("line")
          .attr("x2", width);
          
      _.each(rowTextSpec, function(spec, cls) {
        rowEnter.append("text")
            .attr("class", cls)
            .attr("x", spec.x)
            .attr("y", idealBandWidth / 2)
            .attr("dy", ".32em")
            .attr("text-anchor", spec.x < 0 ? "end" : "start");
      });
    
      row.merge(rowEnter)
          .attr("class", function(d) { 
            return "row" + (nodes[d.y].samePtMergeParent ? " merged" : "") + rowExtraClasses; 
          })
          .each(updateRowCells);
    
      row.merge(rowEnter).selectAll("text.pt-id.row-label")
          .style("fill", function(d) { return nodes[d.y].group !== null ? c(nodes[d.y].group) : '#ccc'; });
      
      _.each(rowTextSpec, function(spec, cls) {
        row.merge(rowEnter).selectAll("text." + cls.replace(/ /g, '.')).text(spec.fn);
      });
    
      row.merge(rowEnter).transition().duration(transitionDuration).delay(function(d) { return x(d.y) * 1; })
          .attr("transform", function(d) { return "translate(0," + x(d.y) + ")"; })
          .attr("opacity", 1);

      row.exit().transition().duration(transitionDuration)
          .attr("opacity", 0)
          .remove();
      row.exit().selectAll(".cell").interrupt();
    }
    
    var tipRows = {
          eRAP_ID: "Anon Pt ID",
          hospitalAndUnit: "Unit",
          ordered: "Order Date",
          mlst_subtype: "MLST", 
          isolate_ID: "Isolate ID",
          assembly_ID: "Assembly ID",
          contig_count: "# contigs",
          contig_N50_format: 'Contig N50',
          contig_maxlength_format: 'Longest contig',
          "--": null,
          group: 'Cluster #',
          groupSize: 'Cluster size'
        };
    if (_.any(nodes, function(node) { return !!node.coreGenomeSize; })) {
      _.extend(tipRows, {
        whichTree: 'Mash precluster #',
        coreGenomeSize: 'Core genome',
        clusterCoverageRange: 'Cluster coverage'
      });
    }
    
    function tipLinkHtml(ixLeft, ixRight, dist) {
      var leftClust = nodes[ixLeft].samePtMergeParent,
          rightClust = nodes[ixRight].samePtMergeParent,
          html = '<table class="link-info bottom-border"><tr class="separator"><th class="row-label">Distance</th>' +
                 '<th class="dist" colspan=2><span class="dist-value">' + dist + '</span> SNPs</th></tr>',
          snvs_url;
      
      // For each side of the tooltip table, if it is a merged isolate, display info for the *closest* isolate.
      if (leftClust) {
        ixLeft = _.first(_.sortBy(leftClust, function(i) { 
          var cell = fullMatrix[i][ixLeft];
          return cell.origZ !== null ? cell.origZ : cell.z; 
        }));
      }
      if (rightClust) {
        ixRight = _.first(_.sortBy(rightClust, function(i) { 
          var cell = fullMatrix[ixRight][i];
          return cell.origZ !== null ? cell.origZ : cell.z;
        }));
      }
      if (leftClust || rightClust) {
        html += '<tr class="merge"><td/><td>' + (leftClust ? 'MERGED' : '') + '</td><td>' + (rightClust ? 'MERGED' : '') + '</td></tr>';
      }
      
      _.each(tipRows, function(label, k) {
        var val1 = nodes[ixLeft][k],
            val2 = nodes[ixRight][k],
            link, valHasDash;
        if ((/^-+$/).test(k)) { html += '<tr class="separator"><td colspan="2"></td></tr>'; return; }
        if (FORMAT_FOR_DISPLAY && FORMAT_FOR_DISPLAY[k]) { val1 = FORMAT_FOR_DISPLAY[k](val1); val2 = FORMAT_FOR_DISPLAY[k](val2); }
        html += '<tr><td class="row-label">' + label + '</td>';
        if (LINKABLE_FIELDS && (link = LINKABLE_FIELDS[k])) {
          val1 = '<a target="_blank" href="' + link.replace('%s', encodeURIComponent(val1)) + '">' + val1 + '</a>';
          val2 = '<a target="_blank" href="' + link.replace('%s', encodeURIComponent(val2)) + '">' + val2 + '</a>';
        }
        valHasDash = (/&mdash;/).test(val1);
        if (val1 == val2) { html += '<td class="same' + (valHasDash ? '' : ' dashes') + '" colspan=2>' + val1 + '</td></tr>'; }
        else { html += '<td>' + val1 + '</td><td>' + val2 + '</td></tr>'; }
      });
      
      html += '</table>'
      if (leftClust || rightClust) { html += '<div class="merge-warn">For merged isolates, closest isolate is shown.</div>'; }
      html += '<div class="more"><span class="instructions">Click for links</span><span class="links">';
      if (assemblies.out_dir) {
        snvs_url = assemblies.out_dir + '/' + nodes[ixLeft].name + '/' + nodes[ixLeft].name + '_' + nodes[ixRight].name + '.snv.bed',
        snvs_url = (TRACKS_DIR || DATA_DIR) + snvs_url;
        if (IGB_DIR && CHROMOZOOM_URL && TRACKS_DIR) {
          snvs_url = CHROMOZOOM_URL.replace('%s', IGB_DIR + nodes[ixLeft].name) + '&customTracks=' + snvs_url;
          snvs_url += '';
        }
        html += '<a href="' + snvs_url + '" target="_blank">Open SNP track</a>';
      }
      if (nodes[ixLeft].group === nodes[ixRight].group) {
        html += ' <a href="' + $('.cluster-' + nodes[ixLeft].group).attr('href') + '" target="_blank">Explore this cluster\'s timeline</a>';
      }
      html += '</span></div>';
      return html;
    }
    
    function tipHtml(d) {
      if (d.clusteringInfo) { return tipClusteringInfoHtml(d); }
      if (d.cluster) { return tipClusterDetailsHtml(d); }
      if (d.html) { return d.html; }
      return tipLinkHtml(d.y, d.x, d.z);
    }
    
    var tip = d3.tip()
        .attr('class', 'd3-tip')
        .offset(function(d) { return d.tipOffset ? d.tipOffset : (d.clusteringInfo || d.cluster ? [10, 0] : [-10, 0]); })
        .direction(function(d) { return d.tipDir ? d.tipDir : (d.clusteringInfo || d.cluster ? 's': 'n'); })
        .html(tipHtml);
    var selectedCell = null;
    
    heatmapG.call(tip);
    heatmapG.on("click", function() { deselectCell(); tip.hide(); });

    function updateRowCells(rowData, i, elems) {
      var transitionDuration = brushAnimateStatus !== null ? ANIM_TRANSITION_DURATION : TRANSITION_DURATION;
      var cell = d3.select(this).selectAll("rect")
          .data(_.filter(rowData, function(d) { return d.z < MAX_SNP_THRESHOLD; }), cellKeying);
      var numRows = elems.length;
      deselectCell();
      tip.hide();
    
      var cellEnter = cell.enter().append("rect")
          .attr("class", "cell")
          .classed("same-pt", function(d) { return nodes[d.x].eRAP_ID == nodes[d.y].eRAP_ID; })
          .attr("x", function(d) { return x(d.x) + cellPadding(d, numRows); })
          .attr("y", function(d) { return cellPadding(d, numRows); })
          .style("stroke", cellStrokeColor)
          .attr("fill", cellColor)
          .attr("opacity", 0)       // All cells start out transparent and fade in
          .on("mouseover", function(d) { 
            if (!cellClickable(d)) { return; }
            if (!selectedCell) { tip.show(d); }
            mouseoverCell(d);
          })
          .on("click", function(d) { 
            if (selectedCell !== this && cellClickable(d)) { selectCell(d, this); tip.show(d); }
            else { deselectCell(); tip.hide(d); }
            d3.event.stopPropagation();
          })
          .on("mouseout", function(d) { 
            if (!selectedCell) { tip.hide(d); } 
            mouseoutCell(d);
          })
      
      cell.merge(cellEnter).classed("clickable", cellClickable)
          .style("stroke-width", function(d) { return cellStrokeWidth(d, numRows); });
      
      cell.merge(cellEnter).transition().duration(transitionDuration).delay(function(d) { return x(d.x) * 1; })
          .attr("x", function(d) { return x(d.x) + cellPadding(d, numRows); })
          .attr("y", function(d) { return cellPadding(d, numRows); })
          .attr("width", function(d) { return x.bandwidth() - cellPadding(d, numRows) * 2; })
          .attr("height", function(d) { return x.bandwidth() - cellPadding(d, numRows) * 2; })
          .style("stroke", cellStrokeColor)
          .attr("fill", cellColor)
          .attr("opacity", function(d) { return z(d.z); });
    
      cell.exit().transition().duration(transitionDuration)
          .attr("opacity", 0)
          .remove();       
    }

    function mouseoverCell(p) {
      heatmapG.selectAll(".row").classed("active", function(d) { return d.y == p.y || d.y == p.x; });
      heatmapG.selectAll(".column").classed("active", function(d) { return d.y == p.x || d.y == p.y; });
      heatmapG.selectAll(".cell").classed("active", function(d) { return d.y == p.y && d.x == p.x; });
    }

    function mouseoutCell() {
      heatmapG.selectAll(".active").classed("active", false);
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
      heatmapG.selectAll("*").interrupt();
    }
    
    
    // ******************************* CLUSTER LEGEND **************************************
    
    var clusterLegend = d3.select("#cluster-legend"),
        clusterListSvg = clusterLegend.select('#cluster-list'),
        clusteringInfoSvg = d3.select('#cluster-info').select('svg');
    
    function updateDetectedClusters(clusters) {
      clusterLegend.style('display', 'inline');
      clusterLegend.select('.num-clusters').text(clusters.length);
      clusterListSvg.attr("width", clusters.length * 26).call(tip);
      
      var clusterList = clusterListSvg.selectAll('a').data(clusters);
      var clusterEnter = clusterList.enter().append('a');
      
      clusterEnter.append('rect')
          .attr("width", 22)
          .attr("height", 22);
      
      clusterEnter.append('text')
          .attr("x", 11)
          .attr("y", 15)
          .attr("text-anchor", "middle");
      
      clusterList.merge(clusterEnter)
          .attr("transform", function(d, i) { return "translate(" + (i * 26) + ",0)"; })
          .attr("href", function(d) {
            var assemblyNames = _.map(d.index, function(leaf) { 
              return encodeURIComponent(clusterableNodes[leaf.index].name); 
            });  
            return "dendro-timeline.php?db=" + db + "&assemblies=" + assemblyNames.join('+');
          })
          .attr("target", "_blank")
          .attr("class", function(d, i) { return "cluster-" + i.toString(); })
          .on("mouseenter", function(d, i) {
            tip.show({cluster: d, clusterNum: i})
          })
          .on("mouseleave", function() {
            tip.hide();
          });
      
      clusterList.merge(clusterEnter).select('rect')
          .style("fill", function(d, i) { return c(i); } );
      
      clusterList.merge(clusterEnter).select('text')
          .text(function(d) { return d.index.length; });
      
      clusterList.exit().remove();
      
      updateMaxClusterSizeWarning(clusters);
      updateClustersTSVBlob(clusters);
    }
    
    function updateMaxClusterSizeWarning(clusters) {
      var $warn = $('#max-cluster-size-warning').stop(),
          maxTreeSize = _.max(treeSizes),
          largestClusterSizeIncludingSamePtChildren = _.max(_.pluck(clusters, 'sizeIncludingSamePtChildren'));
      if (largestClusterSizeIncludingSamePtChildren >= maxTreeSize) {
        _.defer(function() { $warn.slideDown(); });
      } else { _.defer(function() { $warn.slideUp(); }); }
    }
    
    function updateClustersTSVBlob(clusters) {
      var rows = [["isolate_ID", "merged_into_isolate_ID", "eRAP_ID", "cluster_num", "cluster_color", 
          "assembly_name"]];
      _.each(clusters, function(clust, i) {
        _.each(clust.index, function(clustLeaf) {
          var node = clusterableNodes[clustLeaf.index];
          rows.push([node.isolate_ID, '', node.eRAP_ID, i, c(i), node.name]);
          // Also include rows for isolates merged into this one, for having the same patient ID.
          if (node.samePtMergeParent) {
            _.each(node.samePtMergeParent, function(childNodeIndex) {
              var childNode = nodes[childNodeIndex];
              // The same-patient clusters include a link back to the parent isolate, which is redundant here
              if (childNode.isolate_ID == node.isolate_ID) { return; }
              rows.push([childNode.isolate_ID, node.isolate_ID, childNode.eRAP_ID, i, c(i), node.name]);
            });
          }
        });
      });
      var tsv = _.map(rows, function(cells) { return cells.join("\t"); }).join("\n");
      $('#download-clusters').data('tsvBlob', new Blob([tsv], { type: "text/plain;" }));
    }
    
    function formatTipRow(value, label) {
      if (FORMAT_FOR_DISPLAY && FORMAT_FOR_DISPLAY[label]) { value = FORMAT_FOR_DISPLAY[label](value); }
      if ((/^-+$/).test(label)) { return '<tr class="separator"><td colspan="2"></td></tr>'; }
      var html = '<tr><td class="row-label">' + label + '</td>';
      if (LINKABLE_FIELDS && (link = LINKABLE_FIELDS[label])) {
        value = '<a target="_blank" href="' + link.replace('%s', encodeURIComponent(value)) + '">' + value + '</a>';
      }
      html += '<td>' + value + '</td></tr>';
      return html;
    }
    
    function tipClusterDetailsHtml(d) {
      var html = '<table class="link-info">',
          tipRows = {
            'Cluster #': d.clusterNum,
            'Cluster size': d.cluster.index.length
          };
      
      if (_.any(nodes, function(node) { return !!node.coreGenomeSize; })) {
        var clustFirstNode = clusterableNodes[d.cluster.index[0].index],
            clustNodes = _.pick(clusterableNodes, _.pluck(d.cluster.index, 'index')),
            clustCoreGenomeSizes = _.pluck(clustNodes, 'coreGenomeSize');
        _.extend(tipRows, {
          'Mash precluster #': clustFirstNode.whichTree,
          'Core genome': _.min(clustCoreGenomeSizes),
          'Cluster coverage': clustFirstNode.clusterCoverageRange
        });
      }
          
      _.each(tipRows, function(value, label) { html += formatTipRow(value, label); });
      html += '</table>';
      html += '<div class="more"><span class="instructions">Click to explore this cluster\'s timeline</span></div>';
      return html;
    }
    
    function tipClusteringInfoHtml(d) { 
      var html = '<table class="link-info">';
      _.each(d.clusteringInfo, function(value, label) { html += formatTipRow(value, label); });
      html += '</table>';
      return html;
    }
    
    function calculateClusteringInfo(clusters) {
      var clusterNodes = _.map(clusters, function(clust) { 
          return _.map(clust.index, function(leaf) { return clusterableNodes[leaf.index]; }); 
        }),
        coreGenomeSizes = _.pluck(_.flatten(clusterNodes), 'coreGenomeSize'),
        coverageRanges = _.pluck(_.flatten(clusterNodes), 'clusterCoverageRange');
      var info = {"# clusters": clusters.length};
      info["--"] = true;
      info["# patients in clusters"] = _.uniq(_.compact(_.pluck(_.flatten(clusterNodes), 'eRAP_ID'))).length;
      info["# patients total"] = _.uniq(_.compact(_.pluck(nodes, 'eRAP_ID'))).length;
      info["% patients clustered"] = info["# patients in clusters"] / info["# patients total"] * 100;
      info["---"] = true;
      info["# isolates in clusters"] = _.uniq(_.compact(_.pluck(_.flatten(clusterNodes), 'isolate_ID'))).length;
      info["# isolates total"] = _.uniq(_.compact(_.pluck(nodes, 'isolate_ID'))).length;
      info["% isolates clustered"] = info["# isolates in clusters"] / info["# isolates total"] * 100;
      info["----"] = true;
      info["Core genome size range"] = [_.min(coreGenomeSizes), _.max(coreGenomeSizes)];
      info["Cluster coverage range"] = [_.min(_.pluck(coverageRanges, 0)), _.max(_.pluck(coverageRanges, 1))];
      return info;
    }
    
    function initClusteringInfoTooltip() {
      clusteringInfoSvg.call(tip);
      var clusteringInfoRect = clusteringInfoSvg.append('rect')
          .style('fill', 'transparent')
          .attr('width', clusteringInfoSvg.attr('width'))
          .attr('height', clusteringInfoSvg.attr('height'));
      clusteringInfoRect.on("mouseover", function() {
            var clusters = clusterLegend.select('#cluster-list').selectAll('a').data();
            tip.show({clusteringInfo: calculateClusteringInfo(clusters)});
          })
          .on("mouseout", function() {
            tip.hide();
          });
    }
    
    updateDetectedClusters(detectedClusters);
    initClusteringInfoTooltip();
    
    
    // ******************************* DENDROGRAM ****************************************
    
    var dendroG = heatmapG.append("g")
        .attr("class", "dendro")
        .attr("transform", "translate(" + width + ",0)");
        
    dendroG.append("path")
        .attr("d", "M0,0 H" + dendroRight * 0.9)
        .attr("class", "scale");
    
    dendroG.append("text")
        .attr("class", "axis-label")
        .attr("x", dendroRight * 0.45)
        .attr("y", -10)
        .attr("dy", ".32em")
        .attr("text-anchor", "middle")
        .text(MAX_SNP_THRESHOLD + " " + assemblies.distance_unit);
    
    var dendroX = d3.scaleLinear().range([0, dendroRight * 0.9])
    
    // Do a second round of single-linkage agglomerative clustering only for the nodes within the domain.
    // This lets us draw the dendrogram.
    function reclusterFilteredNodes(filteredDomain) {
      var filteredClusters, dendroDomain;

      function disFunc(a, b) { return (fullMatrix[a][b].z + fullMatrix[b][a].z) / 2; }
      if (!filteredDomain.length) { return {cut: function() { return []; }, index: [], children: []}; }
      
      // We only need to cluster nodes that have at least one link below MAX_SNP_THRESHOLD
      // All other nodes won't have any links in the dendrogram, and only waste time during `HClust.agnes` below
      dendroDomain = _.filter(filteredDomain, function(i) {
        var linkInRow = _.find(fullMatrix[i], function(cell, j) { return i != j && cell.z <= MAX_SNP_THRESHOLD; }),
          linkInCol = _.find(fullMatrix, function(col, j) { return i != j && col[i].z <= MAX_SNP_THRESHOLD; });
        return linkInRow || linkInCol;
      });
      
      if (dendroDomain.length) {
        filteredClusters = HClust.agnes(dendroDomain, {disFunc: disFunc, kind: 'single'});
        _.each(filteredClusters.index, function(leaf, i) { 
          leaf.data = nodes[dendroDomain[leaf.index]];
          leaf.data.groupOrder = i;
        });
      }
      return filteredClusters ? filteredClusters.cut(MAX_SNP_THRESHOLD) : [];
    }
    
    function updateDendrogram(cutClusters, matrix) {
      var transitionDuration = brushAnimateStatus !== null ? ANIM_TRANSITION_DURATION : TRANSITION_DURATION;
      var noLabels = matrix.length > rowLimitForLabels;
      var marginRight = noLabels ? 0 : margin.right - dendroRight * 0.95;
      
      cutClusters = _.filter(cutClusters, function(clust) { return !!clust.children; });
      
      dendroG.attr("transform", "translate(" + (width + marginRight) + ",0)");
      dendroX.domain([0, MAX_SNP_THRESHOLD]);
      
      var dendroPath = dendroG.selectAll(".link")
          .data(linksFromClusters(cutClusters), function(d) { return d.leaf; });
      var dendroEnter = dendroPath.enter().append("path")
          .attr("class", "link")
          .attr("opacity", 0);
      dendroPath.merge(dendroEnter)
          .classed("leaf", function(d) { return d.leaf; })
        .transition().duration(transitionDuration * 0.5)
          .attr("opacity", 0)
        .transition().duration(1).delay(transitionDuration * 0.5)
          .attr("d", function(d) { return "M" + d.x1 + "," + d.y1 + " " + "V" + d.y2 + "H" + d.x2 ; })
        .transition().duration(transitionDuration * 0.5).delay(transitionDuration * 0.5)
          .attr("opacity", 1);
      dendroPath.exit().transition().duration(transitionDuration * 0.5)
          .attr("opacity", 0)
          .remove();
    }
    
    function calculateMidpoints(clusters) {
      var midpoints = _.map(clusters.children, function(child) {
        if (!child.children) { return child.midpoint = x(child.data.i) + (0.5 * x.bandwidth()); }
        else { return calculateMidpoints(child); }
      });
      return clusters.midpoint = (d3.max(midpoints) + d3.min(midpoints)) / 2;
    }
    
    function extractLinks(clusts, links) {
      if (!clusts.children) { return; }
      _.each(clusts.children, function(child) {
        links.push({x1: dendroX(clusts.distance), y1: clusts.midpoint, x2: dendroX(child.distance), y2: child.midpoint});
        if (child.children) { extractLinks(child, links); }
        else { links.push({x1: dendroX(child.distance), y1: child.midpoint, x2: -10, y2: child.midpoint, leaf: true}) }
      });
    }
    
    function linksFromClusters(clusters) {
      var links = [];
      _.each(clusters, function(clust) {
        calculateMidpoints(clust);
        extractLinks(clust, links);
      });
      return links;
    }

    
    // ****************************** NETWORK + MAP DIAGRAM *********************************
    
    var networkLinks = networkG.append("g")
        .attr("class", "network-links")
    
    var networkNodes = networkG.append("g")
        .attr("class", "network-nodes")
    
    var networkOrigin = {x: (width + margin.left + margin.right) / 2, y: height * 0.1};
    var simulation = d3.forceSimulation()
        .force("link", d3.forceLink().id(function(d) { return d.i; }).distance(400).strength(0))
        .force("collision", d3.forceCollide(5.5))
        .force("stickyX", d3.forceX().strength(0.1).x(function(d) { 
          var coords = unitCoords[d.data.hospitalAndUnit || ''];
          return coords ? coords[0] : networkOrigin.x; 
        }))
        .force("stickyY", d3.forceY().strength(0.2).y(function(d) { 
          var coords = unitCoords[d.data.hospitalAndUnit || ''];
          return coords ? coords[1] : networkOrigin.y; 
        }));
    
    var simulationCooldown = null;
    
    // requires the global fullMatrix
    function linksFromFilteredDomain(filteredDomain) {
      var links = [],
          snpThreshold = parseInt($('#snps-num').val(), 10);
      _.each(filteredDomain, function(i, x) {
        _.each(filteredDomain.slice(x + 1), function(j) {
          var avgDist = (fullMatrix[i][j].z + fullMatrix[j][i].z) / 2;
          if (avgDist <= snpThreshold) { links.push({source: i, target: j, value: MAX_SNP_THRESHOLD / avgDist}); }
        });
      });
      return links;
    }
    
    function updateNetwork(filteredDomain) {
      var previousNodes = {};
      _.each(simulation.nodes(), function(node) { previousNodes[node.i] = node; });
      
      var filteredNodes = _.map(_.pick(nodes, filteredDomain), function(node) {
            var prev = previousNodes[node.i],
                nodeCoords = unitCoords[node.hospitalAndUnit || ''] || [0, 0];
            return {
              i: node.i, 
              data: node, 
              x: (prev ? prev.x : nodeCoords[0] || networkOrigin.x), 
              y: (prev ? prev.y : nodeCoords[1] || networkOrigin.y)
            }; 
          }),
          filteredLinks = linksFromFilteredDomain(filteredDomain);
      
      var linkLines = networkLinks.selectAll("line")
          .data(filteredLinks, function(d) { 
            return (_.isUndefined(d.source.i) ? d.source : d.source.i) + ' ' + 
                   (_.isUndefined(d.target.i) ? d.target : d.target.i);
          });
      var linkEnter = linkLines.enter().append("line");
      linkLines.merge(linkEnter)
          .attr("stroke-width", function(d) { return Math.sqrt(d.value) / Math.sqrt(MAX_SNP_THRESHOLD) * 5; });
      linkLines.exit().remove();
      
      function dragstarted(d) {
        if (!d3.event.active) simulation.alphaTarget(1).restart();
        d.fx = d.x;
        d.fy = d.y;
      }

      function dragged(d) {
        d.fx = d3.event.x;
        d.fy = d3.event.y;
      }

      function dragended(d) {
        if (!d3.event.active) {
          clearTimeout(simulationCooldown);
          simulationCooldown = setTimeout(function() { simulation.alphaTarget(0); }, 1000);
        }
        d.fx = null;
        d.fy = null;
      }
      
      var nodeCircles = networkNodes.selectAll("circle")
          .data(filteredNodes, function(d) { return d.i; });
      var nodeEnter = nodeCircles.enter().append("circle")
          .attr("r", 5)
          .attr("cx", function(d) { return d.x; })
          .attr("cy", function(d) { return d.y; })
          .call(d3.drag()
              .on("start", dragstarted)
              .on("drag", dragged)
              .on("end", dragended));
      nodeCircles.merge(nodeEnter)
          .classed("ungrouped", function(d) { return d.data.group === null; })
          .attr("fill", function(d) { return d.data.group !== null ? c(d.data.group) : 'white'; })
      nodeCircles.exit().remove();
      
      simulation
          .nodes(filteredNodes)
          .on("tick", function() {
              linkLines.merge(linkEnter)
                  .attr("x1", function(d) { return d.source.x; })
                  .attr("y1", function(d) { return d.source.y; })
                  .attr("x2", function(d) { return d.target.x; })
                  .attr("y2", function(d) { return d.target.y; });

              nodeCircles.merge(nodeEnter)
                  .attr("cx", function(d) { return d.x; })
                  .attr("cy", function(d) { return d.y; });
          });

      simulation.force("link")
          .links(filteredLinks);
      
      simulation.alphaTarget(1).restart();
      clearTimeout(simulationCooldown);
      simulationCooldown = setTimeout(function() { simulation.alphaTarget(0); }, 1000);
    }
    
    
    // ************************* EPI HEATMAP (BEHIND NETWORK) ******************************
    
    var epiHeatmap = h337.create({
      container: $('#epi-heatmap > .cont').get(0),
      gradient: {
          '.5': 'blue',
          '.8': 'red',
          '.95': 'white'
        }
    });
    $('#epi-heatmap').css('position', 'absolute');
    
    function updateEpiHeatmap(filteredIsolates) {
      epiHeatmap.setData({
        max: Math.pow(10, parseFloat($('#epi-heatmap-gain').attr('max')) - $('#epi-heatmap-gain').val()),
        data: filteredIsolates
      })
    }
    
    // ************************* BIND UI EVENTS -> CALLBACKS *******************************
    
    $("#order").on("change", function() { reorder(); });
    $('#db').on('change', function() { window.location.search = '?db=' + $(this).val(); });
    
    var mlsts = _.pluck(nodes, 'mlst_subtype');
    _.each(_.sortBy(_.uniq(mlsts)), function(mlst) { 
      $('#mlsts').append('<option value="mlst_subtype:' + mlst + '">MLST: ' + mlst + '</option>'); 
    });
    var units = _.pluck(nodes, 'hospitalAndUnit');
    _.each(_.sortBy(_.compact(_.uniq(units))), function(unit) { 
      $('#units').append('<option value="hospitalAndUnit:' + unit + '">Unit: ' + unit + '</option>'); 
    });
    $('#filter').select2({placeholder: "Click to add/remove filters"})
    $('#filter-cont .select2-selection').append(
        '<span class="select2-selection__arrow" role="presentation"><b role="presentation"></b></span>');
    $('#filter').on('change', function() { 
      if ($LOADING_SPINNER.is(':hidden')) { $LOADING_SPINNER.fadeIn(function() { changeSnpThreshold(); }); }
      else changeSnpThreshold();
    });
    
    // Setup the distance threshold slider and bind it to changing the disabled input
    $('#snps').attr({value: DEFAULT_SNP_THRESHOLD, min: MIN_SNP_THRESHOLD, max: MAX_SNP_THRESHOLD}).rangeslider({ 
      polyfill: false,
      onSlide: function(pos, value) { $('#snps-num').val(value); $LOADING_SPINNER.show(); updateHistoCutoff(value); },
      onSlideEnd: function(pos, value) { $('#snps-num').change(); }
    });
    $('#snps').on('change', function(e, dontPropagate) { if (!dontPropagate) { $('#snps-num').change(); } });
    // The SNP threshold input then calls the changeSnpThreshold function for updating the viz
    $('#snps-num').on('change', changeSnpThreshold);
    
    // Allow downloading of clusters as TSV
    $('#download-clusters').on('click', function() {
      var filename = db + ".dist-" + $('#snps-num').val() + ".clusters.tsv"; 
      saveAs($(this).data('tsvBlob'), filename); 
    });
    
    // Setup the animation of the daterange brush
    $('#daterange-animate .toggle-btn').click(function() {
      var noChange = $(this).hasClass('active'),
          action = $(this).data('action'),
          retargetSpeed = parseFloat($(this).data('speed')),
          startSelection = d3.brushSelection(brushG.node()),
          wasRunning = brushAnimateStatus !== null;
      
      if (noChange) { return; }
      $(this).addClass('active').siblings('.toggle-btn').removeClass('active');
      
      if (action == 'pause') {
        brushAnimateStatus = null;
        brush.move(brushG, startSelection);  // Ensure animation is stopped and UI is synched
      } else {
        // If we are trying to start an animation, and the right edge of the brush is already at the edge,
        // automatically "rewind" or reset the brush selection to a window that allows an animation to begin
        if (!wasRunning && startSelection[1] == width) {
          startSelection = startSelection[0] === 0 ? [0, width * 0.15] : [0, startSelection[1] - startSelection[0]];
          brush.move(brushG, startSelection);
        }
        
        brushAnimateStatus = {started: +new Date, lastRefresh: +new Date, speed: retargetSpeed, action: action};

        !wasRunning && animLoop(function(deltaT) {
          if (brushAnimateStatus === null) { return false; }
          var oldSelection = d3.brushSelection(brushG.node()),
              act = brushAnimateStatus.action,
              newRight = Math.min(oldSelection[1] + deltaT * brushAnimateStatus.speed, width);
              newSelection = [(act == 'play' ? newRight - oldSelection[1] : 0) + oldSelection[0], newRight];
          brush.move(brushG, newSelection);
          if (newRight == width) {
            $('#daterange-animate .toggle-btn.pause').click();
            return false;
          }
        });
      }
    });
    
    // Setup the spatiotemporal map controls
    $('#epi-heatmap-opacity').rangeslider({ 
      polyfill: false,
      onSlide: function(pos, value) { $('#epi-heatmap .heatmap-canvas, .color-scale').css('opacity', value); },
    }).rangeslider('update', true);
    $('#epi-heatmap-gain').rangeslider({ 
      polyfill: false,
      onSlide: function(pos, value) { 
        var dataMax = Math.pow(10, parseFloat($('#epi-heatmap-gain').attr('max')) - value);
        $('#epi-controls .color-scale > .max').text(Math.round(dataMax));
        epiHeatmap.setDataMax(dataMax); 
      }
    }).rangeslider('update', true);
    $('#network-show').change(function() { $('#main-viz .network')[$(this).is(':checked') ? 'fadeIn' : 'fadeOut'](); });
    $(window).resize(function() { 
      $('#epi-heatmap').css('min-height', $(window).height() - $('#epi-heatmap').offset().top - networkMargin.topPad); 
    }).resize();

    // Setup the view mode toggle botton
    $('#main-viz').children('.heatmap').data('active', true);
    $('#toggle-main .toggle-btn').click(function() {
      var activating = !$(this).hasClass('active'),
          showingWhat = $(this).data('show');
      if (showingWhat == 'network') { $('#network-show').prop('checked', true); }
      if (activating) {
        deselectCell();
        tip.hide();
        $(this).addClass('active').siblings('.toggle-btn').removeClass('active');
        $('.main-view.' + showingWhat).data('active', true).fadeIn();
        $('.main-view:not(.' + showingWhat + ')').data('active', false).fadeOut(function() {
          reorder();
          $(window).resize();
        });
      }
    });
    
    // ************************** UPDATING UI FROM THE DATA **********************************

    var fadeOutSpinnerDebounced = _.debounce(function() { $LOADING_SPINNER.fadeOut(); }, 300);

    function reorder() {    
      var filteredDomain = filterByBrush(filterByVisibleNodes(d3.range(n))), 
          cutClusters = reclusterFilteredNodes(filteredDomain)
          filteredIsolateIds = filterByBrush(d3.range(epiData.isolates.length), epiData.isolates);
                
      filteredDomain = calculateOrder(filteredDomain, $('#order').val());
      
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
      
      if ($('#main-viz').children('.heatmap').data('active')) {
        updateColumns(filteredMatrix);
        updateRows(filteredMatrix);    
        updateDendrogram(cutClusters, filteredMatrix);
      } else {
        updateEpiHeatmap(_.values(_.pick(epiData.isolates, filteredIsolateIds)));
        updateNetwork(filteredDomain);
      }
      
      syncDOMToQueryParamsDebounced(queryParamSpec);
      fadeOutSpinnerDebounced();
    }
  
    function changeSnpThreshold() {
      interruptAllTransitions();
      var snpThreshold = parseInt($('#snps-num').val(), 10);      
      calculateMatrixAndNodeSubsets(nodes, links, snpThreshold, getFilters('#filter'));
    
      z.domain([snpThreshold + 1, 0]);
    
      reorder();
      updateNodes(visibleNodes);
      updateDetectedClusters(detectedClusters);
    }
    
    var changeSnpThresholdDebouncedInner = _.debounce(changeSnpThreshold, 200);
    function changeSnpThresholdDebounced() {
      $LOADING_SPINNER.show();
      changeSnpThresholdDebouncedInner();
    }


    // **************************** START THE VISUALIZATION ************************************
    
    // Syncs URL params to DOM elements that control the visualization.
    // This is also how we kick off an initial data update to perform the first draw of heatmap
    syncQueryParamsToDOM(queryParamSpec, {range: [0.7, 1.0]});


    // ************************* DOWNLOAD SPATIOTEMPORAL AND EPI DATA **************************
    
    // This can occur after the first UI update, because it affects the network map (initially hidden)
  
    // Download the coordinates for units on the map
    d3.json("maps/" + HOSPITAL_MAP + ".json", function(coords) {
      unitCoords = coords;
      
      // Download the spatiotemporal data for all isolates, if it's available
      EPI_FILE && d3.json(DATA_DIR + "/" + EPI_FILE, function(epiFileData) { 
        epiData = epiFileData;
        if (epiData.isolates) {
          // compatibility shim for previous version of .epi.heatmap.json format
          if (epiData.isolates[0] && epiData.isolates[0][0] !== "order_date") {
            epiData.isolates.unshift(["order_date", "collection_unit"]);
          }
          epiData.isolates = tabularIntoObjects(epiData.isolates);
          epiData.isolates = _.compact(_.map(epiData.isolates, function(isolate) {
            isolate.hospitalAndUnit = getHospitalAndUnit(isolate);
            var coords = unitCoords[isolate.hospitalAndUnit];
            if ((/\d{4}-\d{2}-\d{2}/).test(isolate.order_date) && isolate.order_date > '1901-00-00') {
              if (coords && coords[0] != unitCoords[''][0] && coords[1] != unitCoords[''][1]) {
                var d = {
                  ordered: new Date(isolate.order_date),
                  unit: isolate.hospitalAndUnit,
                  value: 1,
                  x: coords[0],
                  y: coords[1]
                };
                if (ANON) { d.ordered.setMonth(d.ordered.getMonth() + rand20 + 10); }
                return d;
              }
            }
          }));
        }
        
        // If any of these URL parameters are given, automatically open the network view and/or animate it
        if (getURLParameter('mode') == 'network') { $('#toggle-main [data-show="network"]').click(); }
        var playMode = getURLParameter('play');
        if (playMode && playMode != "0") { 
          $('#daterange-animate [data-action]').eq(parseInt(playMode, 10)).click();
        }
        
        // Allow the view mode to be reflected in the current query string
        queryParamSpec.mode = function() { return $('.main-view.network').data('active') ? 'network' : ''; }
        
        // ************************* INITIALIZE THE INTROJS TUTORIAL **************************
    
        // This function adds a walkthrough to certain elements on the visualization
        if (_.isFunction(heatmapIntroJs)) { heatmapIntroJs(tip); }
      });
    });
    
  });
  
});