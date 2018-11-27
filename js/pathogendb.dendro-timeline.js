function dendroTimeline(prunedTree, isolates, encounters) {
  // Constants.
  var colors = ["#511EA8", "#4928B4", "#4334BF", "#4041C7", "#3F50CC", "#3F5ED0", "#416CCE", 
    "#4379CD", "#4784C7", "#4B8FC1", "#5098B9", "#56A0AF", "#5CA7A4", "#63AC99", "#6BB18E", 
    "#73B583", "#7CB878", "#86BB6E", "#90BC65", "#9ABD5C", "#A4BE56", "#AFBD4F", "#B9BC4A", 
    "#C2BA46", "#CCB742", "#D3B240", "#DAAC3D", "#DFA43B", "#E39B39", "#E68F36", "#E68234", 
    "#E67431", "#E4632E", "#E1512A", "#DF4027", "#DC2F24"];
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
  var $filter = $('#filter');
  var $timeline = $('#timeline');
  
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
      .svg(d3.select("#dendro")),
      oldBranchLength = tree.branch_length();
  
  // Scale up branch lengths to SNVs per **Mbp** core genome
  tree.branch_length(function() { return oldBranchLength.apply(this, arguments) * 1000000; })
  
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
          .text(isolate.eRAP_ID + ' : ' + isolate.order_date + ' : ' + isolate.collection_unit);
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
  
  // ======================
  // = Setup the timeline =
  // ======================
  
  function filterEncounters(encounters, filters) {
    encounters = _.filter(encounters, function(enc) {
      return (enc.department_name && enc.start_time && enc.end_time && enc.end_time > enc.start_time);
    });
    encounters = _.filter(encounters, function(enc) {
      if (filters == 'outpatient') { return enc.encounter_type != "Hospital Encounter"; }
      if (filters == 'inpatient') { return enc.encounter_type == "Hospital Encounter"; }
      return true;
    });
    return encounters;
  }
  
  function resizeTimelineWidth(paddingLeft, xScale, zoom) {
    var yAxisPadding = 8,
        yAxisSize = 250,
        paddingRight = 80,
        width = $timeline.parent().innerWidth() - paddingLeft - paddingRight,
        oldXScale = xScale.copy();
    
    // If `zoom` is not provided, we are resizing and rescaling before drawing any elements
    xScale.range([0, width - yAxisSize]);
    if (!zoom) { return xScale; }
    
    // Resize **without** rescaling (performed when the window is resized after drawing elements)
    // We need to "bake" the old zoom transforms into future ones, as calling zoom.x() resets everything
    xScale.domain([oldXScale.domain()[0], oldXScale.invert(width - yAxisSize)]);
    zoom.x(xScale);
    
    $timeline.attr("width", paddingLeft + width);
    $timeline.find(".pt-dividers rect").attr("width", width);
    $timeline.find(".pt-dividers text").attr("x", width - yAxisPadding);
    $timeline.find(".zoom-rect").attr("width", width - yAxisSize);
    $timeline.find(".y.axis").attr("transform", "translate(" + (width - yAxisSize + yAxisPadding) + ",0)");
    $('#timeline-clip rect').attr("width", width - yAxisSize);
  }
  
  function updateTimeline(encounters, isolates) {
    var drawableEncounters = filterEncounters(encounters, $filter.val()),
        transfers = _.filter(drawableEncounters, function(enc) { return !!enc.transfer_to; }),
        rowHeight = 10,
        xAxisSize = 20,
        paddingLeft = 40,
        now = new Date(),
        zoomCache = {last: null},
        erapIds = [],
        erapIdDeptTuples = _.map(drawableEncounters, function(enc) { 
          return enc.eRAP_ID + ':' + enc.department_name;
        }).concat(_.map(isolates, function(iso) {
          return iso.eRAP_ID + ':' + iso.collection_unit;
        })),
        height, erapIdDeptTupleScale;
        
    $timeline.children(':not(defs)').remove();
    
    erapIdDeptTuples = _.uniq(erapIdDeptTuples).sort();
    height = erapIdDeptTuples.length * rowHeight;
    erapIdDeptTupleScale = d3.scale.ordinal()
        .domain(erapIdDeptTuples)
        .rangePoints([0, height - rowHeight]);
            
    _.each(erapIdDeptTuples, function(tup) {
      var tup = tup.split(':', 2);
      if (!erapIds.length || _.last(erapIds).id !== tup[0]) {
        erapIds.push({id: tup[0], start: tup[1], end: tup[1], length: 1});
      } else {
        _.last(erapIds).end = tup[1];
        _.last(erapIds).length += 1;
      }
    });
    
    var minEncDate = _.min(_.pluck(encounters, 'start_time')),
        maxEncDate = _.max(_.pluck(encounters, 'end_time')),
        xScale = d3.time.scale.utc().domain(orderedScale.domain()).nice();
    
    resizeTimelineWidth(paddingLeft, xScale, false, false);
    
    var unzoomedXScale = xScale.copy();
        xAxis = d3.svg.axis().scale(xScale).orient("top").ticks(6).tickSize(-height, 0).tickPadding(5),
        oneDayInPx = unzoomedXScale(d3.time.day.offset(now, 1)) - unzoomedXScale(now),
        zoomOutLimit = (unzoomedXScale.domain()[1] - unzoomedXScale.domain()[0]) / (maxEncDate - minEncDate),
        zoom = d3.behavior.zoom()
          .x(xScale)
          .scaleExtent([zoomOutLimit, 10 / oneDayInPx])
          .on("zoom", function() {
            $timeline.trigger("draw");
          });
        
    // Create the root SVG element and a base <g> that is positioned at the upper-left corner of the plot
    // All other elements are descendants of this <g>, which serves as the origin of the coordinate system
    var timelineSvg = d3.select("#timeline")
        .attr("height", erapIdDeptTuples.length * rowHeight + xAxisSize)
      .append("g")
        .attr("transform", "translate(" + paddingLeft + "," + xAxisSize + ")");
    
    // Draw patient Y axis dividers in the very back
    var ptDividersGEnter = timelineSvg.append("g")
        .attr("class", "pt-dividers")
      .selectAll("g")
        .data(erapIds)
      .enter().append("g");
    ptDividersGEnter.append("rect")
        .attr("y", function(erapId) { return erapIdDeptTupleScale(erapId.id + ':' + erapId.start); })
        .attr("height", function (erapId) { return rowHeight * erapId.length; })
        .attr("x", 0)
    ptDividersGEnter.append("text")
        .attr("y", function(erapId) { 
          return erapIdDeptTupleScale(erapId.id + ':' + erapId.start) + rowHeight * erapId.length * 0.5;
        })
        .attr("text-anchor", "end")
        .attr("dy", rowHeight * 0.5)
        .text(function(erapId) { return erapId.id });
                
    // Draw X axis in the back
    timelineSvg.append("g")
        .attr("class", "x axis");
            
    // Plotting area that is clipped so data do not draw outside of it onto the axes
    var plotAreaG = timelineSvg.append("g")
        .attr("class", "plot-area")
        .attr("clip-path", "url(#timeline-clip)");

    // Draw encounters
    var encX = function(enc) { return xScale(enc.start_time); },
        encWidth = function(enc) { return Math.max(xScale(enc.end_time) - xScale(enc.start_time), 0); },
        encY = function(enc) { return erapIdDeptTupleScale(enc.eRAP_ID + ':' + enc.department_name); };
    plotAreaG.append("g")
        .attr("class", "encounters")
      .selectAll("rect")
        .data(drawableEncounters)
      .enter().append("rect")
        .attr("class", function(enc) {
          return enc.encounter_type == "Hospital Encounter" ? "encounter inpatient" : "encounter outpatient";
        })
        .attr("y", encY)
        .attr("height", rowHeight)
        .attr("shape-rendering", "crispEdges");
        
    // Draw transfers
    plotAreaG.append("g")
        .attr("class", "transfers")
      .selectAll("line")
        .data(transfers)
      .enter().append("line")
        .attr("x1", function(enc) { return xScale(enc.end_time); })
        .attr("x2", function(enc) { return xScale(enc.end_time); })
        .attr("y1", function(enc) { 
          var depts = [enc.department_name, enc.transfer_to];
          return _.min(_.map(depts, function(dept) { return erapIdDeptTupleScale(enc.eRAP_ID + ':' + dept); }));
        })
        .attr("y2", function(enc) {
          var depts = [enc.department_name, enc.transfer_to];
          return _.max(_.map(depts, function(dept) { return erapIdDeptTupleScale(enc.eRAP_ID + ':' + dept); }))
              + rowHeight;
        });
    
    // Draw isolates
    var isolateX = function(iso) { return xScale(iso.ordered); },
        isolateY = function(iso) { 
          return erapIdDeptTupleScale(iso.eRAP_ID + ':' + iso.collection_unit) + rowHeight * 0.5; 
        },
        isolateFill = colorByFunctions[$colorBy.val()],
        isolateStroke = function(iso) { return d3.rgb(isolateFill(iso)).darker().toString(); };
    plotAreaG.append("g")
        .attr("class", "isolates")
      .selectAll("circle")
        .data(_.filter(isolates, function(iso) { return !!iso.ordered; }))
      .enter().append("circle")
        .attr("cy", isolateY)
        .attr("r", nodeRadius)
        .style("fill", isolateFill)
        .style("stroke", isolateStroke);
    
    // Draw Y axis labels
    timelineSvg.append("g")
        .attr("class", "y axis")
      .selectAll("text")
        .data(erapIdDeptTuples)
      .enter().append("text")
        .attr("class", "dept-label")
        .attr("y", erapIdDeptTupleScale)
        .attr("dy", rowHeight - 1)
        .text(function(v) { return v.split(':', 2)[1]; });
    
    // Invisible <rect> in front of the plot to capture zoom mouse/touch events
    var zoomRect = timelineSvg.append("rect")
        .attr("class", "zoom-rect")
        .attr("height", height)
        .attr("fill", "none")
        .attr("pointer-events", "all")
        .call(zoom);
    
    // Add a clipping mask so data that moves outside the plot area is clipped
    timelineSvg.append("clipPath")
        .attr("id", "timeline-clip")
      .append("rect")
        .attr("height", height);
    
    // Bind event handler to redraw axes/data after zooming
    $timeline.unbind("draw").on("draw", function() {
      var e = d3.event || zoomCache.last;
      // NOTE: we used to transform parent <g>'s directly from the d3.event calculations, e.g.
      //   .attr("transform", "translate(" + e.translate[0] + "," + "0)scale(" + e.scale + ",1)");
      // but this no longer works after adding the `resizeWidth` event, as that resets `zoom`.
      // Now, we have to reposition every datapoint.
      timelineSvg.select("g.x.axis").call(xAxis);
      timelineSvg.select(".isolates").selectAll("circle")
          .attr("cx", isolateX);
      timelineSvg.select(".encounters").selectAll("rect")
          .attr("x", encX)
          .attr("width", encWidth);
      timelineSvg.select(".transfers").selectAll("line")
          .attr("x1", function(enc) { return xScale(enc.end_time); })
          .attr("x2", function(enc) { return xScale(enc.end_time); })
      if (d3.event) { zoomCache.last = d3.event; }
    });
    $timeline.unbind("resizeWidth").on("resizeWidth", function() {
      resizeTimelineWidth(paddingLeft, xScale, zoom);
      $timeline.trigger("draw");
    });

    $timeline.trigger("resizeWidth");
  }
  updateTimeline(encounters, isolates);
  
  // ==============================================================
  // = Setup callbacks for controls that update the visualization =
  // ==============================================================
  $colorBy.change(function() {
    tree.update();
    updateColorLegend(tree);
    updateTimeline(encounters, isolates);
  });
  $filter.change(function() {
    updateTimeline(encounters, isolates);
  });
  $(window).resize(function() {
    $timeline.trigger("resizeWidth");
  });
}