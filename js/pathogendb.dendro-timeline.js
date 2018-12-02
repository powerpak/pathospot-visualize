function dendroTimeline(prunedTree, isolates, encounters) {
  // Constants.
  var colors = ["#511EA8", "#4928B4", "#4334BF", "#4041C7", "#3F50CC", "#3F5ED0", "#416CCE", 
    "#4379CD", "#4784C7", "#4B8FC1", "#5098B9", "#56A0AF", "#5CA7A4", "#63AC99", "#6BB18E", 
    "#73B583", "#7CB878", "#86BB6E", "#90BC65", "#9ABD5C", "#A4BE56", "#AFBD4F", "#B9BC4A", 
    "#C2BA46", "#CCB742", "#D3B240", "#DAAC3D", "#DFA43B", "#E39B39", "#E68F36", "#E68234", 
    "#E67431", "#E4632E", "#E1512A", "#DF4027", "#DC2F24"];
  var unknownColor = "#AAA";
  var nodeRadius = 4;
  
  // D3 scales, formats, and other helpers that are used globally
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
  var $yGrouping = $('#timeline-grouping');
  
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
  
  // ===================================
  // = Setup the timeline in #timeline =
  // ===================================
  
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
  
  function resizeTimelineWidth(encounters, paddingLeft, xScale, zoom) {
    var yAxisPadding = 8,
        yAxisSize = 250,
        paddingRight = 80,
        width = $timeline.parent().innerWidth() - paddingLeft - paddingRight,
        oldXScale = xScale.copy(),
        now = new Date(),
        minEncDate, maxEncDate, oneDayInPx, zoomOutLimit;
    
    // If `zoom` is not provided, we are only resizing and rescaling **before** drawing any elements
    xScale.range([0, width - yAxisSize]);
    if (!zoom) { return xScale; }
    
    // Resize **without** rescaling (performed when the window is resized after drawing elements)
    // In this case, we need to change the domain of `xScale` to match the new range
    // This requires us reset the zooming behavior with `zoom.x()` as well as its `scaleExtent`
    xScale.domain([oldXScale.domain()[0], oldXScale.invert(width - yAxisSize)]);
    zoom.x(xScale);
    minEncDate = _.min(_.pluck(encounters, 'start_time')),
    maxEncDate = _.max(_.pluck(encounters, 'end_time')),
    oneDayInPx = xScale(d3.time.day.offset(now, 1)) - xScale(now),
    zoomOutLimit = (xScale.domain()[1] - xScale.domain()[0]) / (maxEncDate - minEncDate),
    zoom.scaleExtent([zoomOutLimit, 10 / oneDayInPx])
    
    $timeline.attr("width", paddingLeft + width);
    $timeline.find(".pt-dividers rect").attr("width", width);
    $timeline.find(".pt-dividers text").attr("x", width - yAxisPadding);
    $timeline.find(".zoom-rect").attr("width", width - yAxisSize);
    $timeline.find(".y.axis").attr("transform", "translate(" + (width - yAxisSize + yAxisPadding) + ",0)");
    $('#timeline-clip rect').attr("width", width - yAxisSize);
  }
  
  function setupYScaleAndGroups(tuples, yScale, rowHeight) {
    var yGroups = [],
      yGrouping = _.map($yGrouping.val().split(","), parseInt10),
      selector = function(tup) { return _.map(yGrouping, function(i) { return tup[i]; }) },
      domain, 
      height;
    
    domain = _.sortBy(_.uniq(_.map(tuples, selector), false, stringifyTuple), stringifyTuple);
    height = domain.length * rowHeight;
    yScale.rangePoints([0, height - rowHeight]);
    yScale.domain(domain);
    
    _.each(domain, function(tup) {
      if (!yGroups.length || _.last(yGroups).label !== tup[0]) {
        yGroups.push({label: tup[0], start: tup, end: tup, length: 1});
      } else if (yGrouping.length > 1) {
        _.last(yGroups).end = tup;
        _.last(yGroups).length += 1;
      }
    });
    yGroups.grouping = yGrouping;
    yGroups.selector = selector;
    return yGroups;
  }
  
  function updateTimeline(encounters, isolates) {
    var drawableEncounters = filterEncounters(encounters, $filter.val()),
        transfers = _.filter(drawableEncounters, function(enc) { return !!enc.transfer_to; }),
        rowHeight = 10,
        xAxisSize = 20,
        paddingLeft = 40,
        zoomCache = {last: null},
        erapIdDeptTuples = _.map(drawableEncounters, function(enc) { 
          return [enc.eRAP_ID, enc.department_name];
        }).concat(_.map(isolates, function(iso) {
          return [iso.eRAP_ID, iso.collection_unit];
        })),
        yGroups,
        height,
        yScale, yScaleGrouped;
    
    // Every time we call `updateTimeline()` the `#timeline` svg is cleared and rebuilt
    $timeline.children(':not(defs)').remove();
    
    // Setup Y scale and grouping
    yScale = d3.scale.ordinal();
    yGroups = setupYScaleAndGroups(erapIdDeptTuples, yScale, rowHeight);
    height = _.last(yScale.range()) + rowHeight;
    yScaleGrouped = function(tup) { return yScale(yGroups.selector(tup)); }
    
    // Setup X scale and axis
    var xScale = d3.time.scale.utc().domain(orderedScale.domain()).nice();
    resizeTimelineWidth(encounters, paddingLeft, xScale, false);
    var xAxis = d3.svg.axis().scale(xScale).orient("top").tickSize(-height, 0).tickPadding(5),
        zoom = d3.behavior.zoom()
          .x(xScale)
          .on("zoom", function() {
            $timeline.trigger("zoomX");
          });
        
    // Create the root SVG element and a base <g> that is positioned at the upper-left corner of the plot
    // All other elements are descendants of this <g>, which serves as the origin of the coordinate system
    var timelineSvg = d3.select("#timeline")
        .attr("height", height + xAxisSize)
      .append("g")
        .attr("transform", "translate(" + paddingLeft + "," + xAxisSize + ")");
    
    // Draw patient Y axis dividers in the very back.
    // For now a placeholder is created that is filled later by the `reorderY` handler below.
    var ptDividersG = timelineSvg.append("g")
        .attr("class", "pt-dividers");
                
    // Draw X axis in the back
    timelineSvg.append("g")
        .attr("class", "x axis");
            
    // Plotting area that is clipped so data do not draw outside of it onto the axes
    var plotAreaG = timelineSvg.append("g")
        .attr("class", "plot-area")
        .attr("clip-path", "url(#timeline-clip)");

    // Draw encounters
    var encX = function(enc) { return xScale(enc.start_time); },
        encWidth = function(enc) { return Math.max(xScale(enc.end_time) - xScale(enc.start_time), 0); };
    plotAreaG.append("g")
        .attr("class", "encounters")
      .selectAll("rect")
        .data(drawableEncounters)
      .enter().append("rect")
        .attr("class", function(enc) {
          return enc.encounter_type == "Hospital Encounter" ? "encounter inpatient" : "encounter outpatient";
        })
        .attr("height", rowHeight)
        .attr("shape-rendering", "crispEdges");
        
    // Draw transfers
    plotAreaG.append("g")
        .attr("class", "transfers")
      .selectAll("line")
        .data(transfers)
      .enter().append("line")
        .attr("x1", function(enc) { return xScale(enc.end_time); })
        .attr("x2", function(enc) { return xScale(enc.end_time); });
    
    // Draw isolates
    var isolateX = function(iso) { return xScale(iso.ordered); },
        isolateY = function(iso) { 
          return yScaleGrouped([iso.eRAP_ID, iso.collection_unit]) + rowHeight * 0.5; 
        },
        isolateFill = colorByFunctions[$colorBy.val()],
        isolateStroke = function(iso) { return d3.rgb(isolateFill(iso)).darker().toString(); };
    plotAreaG.append("g")
        .attr("class", "isolates")
      .selectAll("circle")
        .data(_.filter(isolates, function(iso) { return !!iso.ordered; }))
      .enter().append("circle")
        .attr("r", nodeRadius)
        .style("fill", isolateFill)
        .style("stroke", isolateStroke);
    
    // Create a placeholder for Y axis labels
    timelineSvg.append("g")
        .attr("class", "y axis");
    
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
    
    // Bind event handler to redraw axes/data after zooming/panning along the X axis
    $timeline.unbind("zoomX").on("zoomX", function() {
      var e = d3.event || zoomCache.last;
      // NOTE: we used to transform parent <g>'s directly from the d3.event calculations, e.g.
      //   .attr("transform", "translate(" + e.translate[0] + "," + "0)scale(" + e.scale + ",1)");
      // but this no longer works after adding the `resizeWidth` event, as that resets `zoom`.
      // Now, we have to reposition every datapoint.
      xAxis.ticks(Math.floor($timeline.find(".zoom-rect").width() / 100));
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
    
    // Bind event handler to reorder the yScale after setting a new Y axis sort order
    $timeline.unbind("reorderY").on("reorderY", function(e, firstDraw) {
      var duration = 0, height;
      if (!firstDraw) {
        yGroups = setupYScaleAndGroups(erapIdDeptTuples, yScale, rowHeight);
        duration = 500;
      }
      height = _.last(yScale.range()) + rowHeight;
      xAxis.tickSize(-height, 0);
      
      timelineSvg.classed("single-groups", yGroups.grouping.length === 1)
          .classed("grouping-by-pt", yGroups.grouping[0] === 0);
      var ptDividersGG = ptDividersG.selectAll("g").data(yGroups, function(grp) { return grp.label; });
      ptDividersGG.exit().remove();
      
      var ptDividersGEnter = ptDividersGG.enter().append("g");
      ptDividersGEnter.append("rect")
          .attr("x", 0)
      ptDividersGEnter.append("text")
          .attr("text-anchor", "end")
          .attr("dy", rowHeight * 0.5);
          
      ptDividersGG.select("rect").transition().duration(duration)
          .attr("y", function(yGroup) { return yScale(yGroup.start); })
          .attr("height", function (yGroup) { return rowHeight * yGroup.length; });
      ptDividersGG.select("text")
          .attr("y", function(yGroup) { 
            return yScale(yGroup.start) + rowHeight * yGroup.length * 0.5;
          })
          .text(function(yGroup) { return yGroup.label });
      
      plotAreaG.select(".encounters").selectAll("rect").transition().duration(duration)
          .attr("y", function(enc) { return yScaleGrouped([enc.eRAP_ID, enc.department_name]); })
      plotAreaG.select(".transfers").selectAll("line").transition().duration(duration)
          .attr("y1", function(enc) { 
            var depts = [enc.department_name, enc.transfer_to];
            return _.min(_.map(depts, function(dept) { return yScaleGrouped([enc.eRAP_ID, dept]); }));
          })
          .attr("y2", function(enc) {
            var depts = [enc.department_name, enc.transfer_to];
            return _.max(_.map(depts, function(dept) { return yScaleGrouped([enc.eRAP_ID, dept]); }))
                + rowHeight;
          });
      plotAreaG.select(".isolates").selectAll("circle").transition().duration(duration)
          .attr("cy", isolateY);
          
      var yAxisLabels = timelineSvg.select(".y.axis")
        .selectAll("text")
          .data(yScale.domain());
      yAxisLabels.exit().remove();
      
      yAxisLabels.enter().append("text")
          .attr("class", "dept-label")
          .attr("dy", rowHeight - 1);
      yAxisLabels.transition().duration(duration)
          .attr("y", yScale)
          .text(function(v) { return _.last(v); });
          
      zoomRect.attr("height", height);
    });
    
    // Bind event handler to resize the timeline after resizing the browser window
    $timeline.unbind("resizeWidth").on("resizeWidth", function() {
      resizeTimelineWidth(encounters, paddingLeft, xScale, zoom);
      $timeline.trigger("zoomX");
    });

    $timeline.trigger("reorderY", true);
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
  
  $yGrouping.change(function() {
    $timeline.trigger("reorderY", false);
    $timeline.trigger("resizeWidth");
  });
  
  $(window).resize(function() {
    $timeline.trigger("resizeWidth");
  });
}