function dendroTimeline(prunedTree, isolates, encounters, variants, navbar) {
  // Constants.
  var colors = ["#511EA8", "#4928B4", "#4334BF", "#4041C7", "#3F50CC", "#3F5ED0", "#416CCE", 
    "#4379CD", "#4784C7", "#4B8FC1", "#5098B9", "#56A0AF", "#5CA7A4", "#63AC99", "#6BB18E", 
    "#73B583", "#7CB878", "#86BB6E", "#90BC65", "#9ABD5C", "#A4BE56", "#AFBD4F", "#B9BC4A", 
    "#C2BA46", "#CCB742", "#D3B240", "#DAAC3D", "#DFA43B", "#E39B39", "#E68F36", "#E68234", 
    "#E67431", "#E4632E", "#E1512A", "#DF4027", "#DC2F24"];
  var unknownColor = "#AAA";
  var nodeRadius = 4;
  var FORMAT_FOR_DISPLAY = {
    start_time: function(d) { return d.toLocaleString(); },
    end_time: function(d) { return d.toLocaleString(); },
    unit: fixUnit,
    gene: function(d) { 
      if ((/^\d+$/).test(d)) { return d + ' genes'; }
      return d.replace(/^PROKKA_/, 'P_'); 
    },
    chrom: function(d) { 
      if ((/^u\d{5}crpx_c_/).test(d)) { return "chromosome"; }
      if ((/^u\d{5}crpx_p_/).test(d)) { return "plas."; }
      if ((/^u\d{5}[a-z]{4}_[a-z]_/).test(d)) { return "other"; }
      return d; 
    }
  };
  var isolatePath = function(iso) { 
    var radius = iso.symbolRadius || nodeRadius;
    return d3.svg.symbol().size(Math.PI * radius * radius).type(d3.svg.symbolTypes[iso.symbol || 0])(); 
  };
  
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
    isolates: {
      ordered: function(isolate) { 
        return isolate.ordered ? spectralScale(orderedScale(isolate.ordered)) : unknownColor; 
      },
      collection_unit: function(isolate) {
        return isolate.collection_unit ? spectralScale(collectionUnitScale(isolate.collection_unit)) : 
            unknownColor;
      }
    }, 
    encounters: {
      ordered: function(enc) { return null; },
      collection_unit: function(enc) {
        var scaledToNumeric = enc.department_name && collectionUnitScale(enc.department_name);
        return enc.department_name && !_.isUndefined(scaledToNumeric) ? 
            d3.interpolateRgb(spectralScale(scaledToNumeric), 'white')(0.4) : null;
      }
    }
  }
  var $dendroTimeline = $('#dendro-timeline');
  var $filter = $('#filter');
  var $timeline = $('#timeline');
  var $yGrouping = $('#timeline-grouping');
  var $hover = $('#hover');
  var $variantLabels = $('#variant-labels');
  var $variantNtOrAa = $('#variant-nt-or-aa');
  
  // =====================================
  // = Setup the phylotree.js in #dendro =
  // =====================================
  
  var tree = d3.layout.phylotree()
      .options({
        brush: false,
        selectable: false,
        transitions: false,
        "align-tips": true
      })
      .node_circle_size(0)
      .svg(d3.select("#dendro")),
      oldBranchLength = tree.branch_length();
  
  // Constants for positioning
  var isolateColumns = [
    ["isolate_ID", 0, "Isolate ID"],
    ["eRAP_ID", 60, "Anon Pt ID"],
    ["order_date", 110, "Order Date"],
    ["collection_unit", 180, "Unit"]
  ];
  var variantsX = 260, variantHeight = 15, variantWidth = 14;
  var variantMapPadRatio = 0.2, variantMapStepback = 5,
      variantMapContigHeight = 12, minVariantMapWidth = 200;
  
  // Scale up branch lengths to SNVs per **Mbp** core genome
  tree.branch_length(function() { return oldBranchLength.apply(this, arguments) * 1000000; })
  
  if (variants.allele_info) {
    // Tells phylotree to pretend that the branch_names are super long, so it adds extra width to the SVG
    // see https://github.com/veg/phylotree.js/blob/master/examples/leafdata/index.html
    tree.branch_name(function(node) {
      return Array(Math.floor(Math.max(variants.allele_info.length, 10) * 1.8) + 50).join(" ");
    });
  }
  
  // Custom node styler to color the node tip and add extra metadata to the right-hand side
  tree.style_nodes(function(container, node) {
    if (d3.layout.phylotree.is_leafnode(node)) {
      var shiftTip = tree.shift_tip(node)[0],
          isolate = isolates[node.name],
          symbol = container.selectAll("path").data([isolate]),
          texts = container.selectAll("text").data(isolateColumns),
          fillColor = colorByFunctions.isolates[$colorBy.val()](isolate),
          strokeColor = d3.rgb(fillColor).darker().toString(),
          ntOrAa = $variantNtOrAa.val(),
          variantG, variantGGs, variantEnter;
    
      symbol.exit().remove();
      symbol.enter().append("path")
          .attr("class", "isolate isolate-" + fixForClass(isolate.name))
          .on("mouseover", function() { mouseEnterIsolate(d3.event.target); })
          .on("mouseout", function() { mouseLeaveIsolate(d3.event.target); })
          .on("click", function() { clickIsolate(d3.event.target, d3.event.altKey); });
      symbol.attr("d", isolatePath(isolate))
          .attr("transform", "translate(" + (isolate.symbolRadius || nodeRadius) + ',0)')
          .style("fill", fillColor)
          .style("stroke", strokeColor);
      
      // Add columns of textual metadata according to the spec in `isolateColumns`
      texts.exit().remove();
      texts.enter().append("text")
      texts.attr("x", function(d) { return nodeRadius * 2.5 + d[1]; })
          .attr("class", "isolate-metadata isolate-" + fixForClass(isolate.name))
          .attr("transform", "translate(" + shiftTip + ",0)")
          .attr("dx", nodeRadius)
          .attr("dy", nodeRadius)
          .style("font-size", "12px")
          .text(function(d) { return isolate[d[0]]; } );
          
      // Add genomic variant data for each node, if available in `variants.by_assembly`
      if (variants.by_assembly) {
        variantG = container.append("g").attr("class", "variants");
        variantG.attr("transform", "translate(" + (variantsX + shiftTip) + ", " + (-variantHeight * 0.5) + ")");
        variantGGs = variantG.selectAll("g").data(variants.by_assembly[node.name]);
        
        variantGGs.exit().remove();
        variantEnter = variantGGs.enter().append("g")
            .attr("class", "variant")
            .classed("ref", function(d, i) { return d == variants.by_assembly[earliestNode.name][i]; })
            .classed("nonsyn", function(d, i) {
              var aa_alts = variants.allele_info[i].aa_alts;
              return aa_alts && aa_alts[d] != aa_alts[variants.by_assembly[earliestNode.name][i]]; 
            })
            .attr("transform", function(d, i) { return "translate(" + (i * variantWidth) + ",0)"; });
        variantEnter.append("rect")
            .attr("width", variantWidth)
            .attr("height", variantHeight)
        variantEnter.append("text")
            .attr("x", variantWidth * 0.5)
            .attr("y", Math.floor(variantHeight * 0.75))
            .text(function(d, i) { 
              return variants.allele_info[i][ntOrAa + "_alts"][d] || "\u2014"; 
            });
      }
    }
  });
  
  // Parse the Newick-formatted prunedTree for the specified `assemblies` in the query string
  tree(prunedTree);
  
  // Root the tree on the chronologically first isolate
  var earliestNode = _.min(tree.get_nodes(), function(node) { 
    return isLeafNode(node) ? isolates[node.name].ordered : Infinity;
  });
  var latestNode = _.max(tree.get_nodes(), function(node) { 
    return isLeafNode(node) ? isolates[node.name].ordered : -Infinity;
  });
  orderedScale.domain([isolates[earliestNode.name].ordered, isolates[latestNode.name].ordered]);
  tree.reroot(earliestNode);
  tree.layout();

  // ================================================================
  // = Plot variant labels and the genome map next to the phylotree =
  // ================================================================

  function updateVariantLabels() {
    if (!variants.by_assembly || !variants.allele_info) { return; }
    
    var variantLabelsSvg = d3.select("#dendro-variant-labels"),
        whichLabel = $variantLabels.val().split('+'),
        ntOrAa = $variantNtOrAa.val(),
        formatter = FORMAT_FOR_DISPLAY[whichLabel[0]],
        bbox = getBBox(d3.select("#dendro .variants")),
        texts = variantLabelsSvg.selectAll("text").data(variants.allele_info),
        newHeight;
      
    variantLabelsSvg.attr("width", bbox.x + bbox.width);
    texts.exit().remove();
    texts.enter().append("text");
    texts.attr("transform", function(d, i) { 
          return "translate(" + (bbox.x + (i + 0.8) * variantWidth) + ",4)rotate(-60)"; 
        })
        .text(function(d) { 
          var out = formatter ? formatter(d[whichLabel[0]]) : d[whichLabel[0]];
          if (whichLabel[1] == 'pos' && out && !(/^\d+/).test(out)) {
            // Note: NT and AA pos are ZERO-indexed in the .vcf.npz, but we display them as 1-indexed
            out += ":" + (ntOrAa == 'aa' ? 'p' : 'c') + "." + (d[ntOrAa + '_pos'] + 1); 
          }
          return out;
        });
    
    newHeight = _.max(_.map(texts[0], function(node) { return getBBox(node).y + height; }));
    variantLabelsSvg.attr("height", Math.ceil(newHeight));
  }
  updateVariantLabels();
  
  function updateGenomeVariantMap() {
    if (!variants.allele_info || !variants.chrom_sizes) { return; }
    var chromSizes = variants.chrom_sizes,
        genomeSize = _.pluck(chromSizes, 'size').sum(),
        padPerContig = Math.round(variantMapPadRatio * genomeSize / Math.max(chromSizes.length - 1, 1)),
        genomeSizePadded = genomeSize + padPerContig * (chromSizes.length - 1),
        bbox = getBBox(d3.select("#dendro .variants")),
        variantMapWidth = Math.max(bbox.width, minVariantMapWidth),
        variantMapHeight = bbox.y,
        xScale = d3.scale.linear().domain([0, genomeSizePadded]).range([0, variantMapWidth]),
        paddedStarts = {},
        pos = 0,
        paddedGenomicPos, xScaleChromPos, variantMapG, chromGs, chromEnter, mappingPaths;
    
    _.each(chromSizes, function(chrom) {
      paddedStarts[chrom.chrom] = pos;
      pos += chrom.size + padPerContig;
    });
    paddedGenomicPos = function(chrom, pos) { return paddedStarts[chrom] + pos; }
    xScaleChromPos = function(chrom, pos) { return xScale(paddedGenomicPos(chrom, pos)); }
    
    variantMapG = d3.select('#dendro .variant-map');
    if (variantMapG.node() === null) { 
      variantMapG = d3.select('#dendro').append("g").attr("class", "variant-map");
      variantMapG.attr("transform", "translate(" + bbox.x + ",0)"); 
    }
    
    chromGs = variantMapG.selectAll("g.chrom").data(chromSizes);
    chromGs.exit().remove();
    chromEnter = chromGs.enter().append("g")
        .attr("transform", function(d) { return "translate(" + xScaleChromPos(d.chrom, 0) + ",1)"; });
    chromEnter.append("rect")
        .attr("width", function(d) { return xScaleChromPos(chromSizes[0].chrom, d.size); })
        .attr("height", variantMapContigHeight);
    chromEnter.append("text")
        .attr("x", function(d) { return xScaleChromPos(chromSizes[0].chrom, d.size) * 0.5; })
        .attr("y", variantMapContigHeight * 0.8)
        .text(function(d) { return FORMAT_FOR_DISPLAY.chrom(d.chrom); })
    
    mappingPaths = variantMapG.selectAll("path").data(variants.allele_info);
    mappingPaths.exit().remove();
    mappingPaths.enter().append("path")
        .attr("d", function(d, i) {
          var path = "M " + ((i + 0.5) * variantWidth) + " " + variantMapHeight,
              targetX = xScaleChromPos(d.chrom, d.pos);
          path += " L" + ((i + 0.5) * variantWidth) + " " + (variantMapHeight - variantMapStepback);
          path += " L" + targetX + " " + (variantMapContigHeight + variantMapStepback);
          path += " L" + targetX + " 1";
          return path;
        });
  }
  updateGenomeVariantMap();
  
  // ==========================
  // = Setup the color legend =
  // ==========================
  
  function updateColorLegend(tree) {
    var colorSvg = d3.select("#color-scale"),
        swatchHeight = 20,
        idealNumSwatches = Math.min(_.keys(isolates).length, 8),
        labelFormatter = _.identity,
        marginTop = 40,
        colorSwatches, fillFunction, swatchData;
    
    if ($colorBy.val() == 'ordered') {
      swatchData = idealNumSwatches > 3 ? orderedScale.ticks(idealNumSwatches) : orderedScale.domain();
      fillFunction = function(d) { return spectralScale(orderedScale(d)) };
      labelFormatter = orderedFormat;
    } else {
      swatchData = collectionUnitScale.domain();
      fillFunction = function(d) { return spectralScale(collectionUnitScale(d)) };
    }
    colorSwatches = colorSvg.selectAll("g").data(swatchData);
    
    colorSvg.attr("height", Math.max(tree.size()[0], swatchData.length * swatchHeight + marginTop));
    
    colorSwatches.exit().remove();
  
    var swatchEnter = colorSwatches.enter().append("g")
        .attr("transform", function(d, i) { return "translate(0," + (i * swatchHeight + marginTop) + ")" });
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
  
  // =====================================================
  // = Setup tooltips and mouse events for the timeline  =
  // =====================================================
  
  var tipRows = {
        department_name: "Unit",
        eRAP_ID: "Patient #",
        encounter_type: "Encounter Type",
        start_time: "Start Time", 
        end_time: "End Time",
        transfer_to: "Pt Transfers To"
      };
  
  // Generates tooltip HTML for a given encounter datum, using the above tipRows spec
  function tipHtml(d) {
    html = '<table class="link-info enc-info">';
    _.each(tipRows, function(label, k) {
      var val = d[k];
      if (FORMAT_FOR_DISPLAY[k]) { val = FORMAT_FOR_DISPLAY[k](val); }
      if (!_.isUndefined(val) && val !== null && val !== "") {
        html += '<tr><td class="row-label">' + label + '</td><td>' + val + '</td></tr>';
      }
    });
    html += '</table>';
    return html;
  }
  
  var tip = d3.tip()
      .attr("class", "d3-tip")
      .offset([-10, 0])
      .html(tipHtml);
  d3.select("#timeline").call(tip);
  
  // Generic handlers for mouse events on encounter and isolate SVG elements
  function mouseLeaveEncounter(el) {
    $(el).removeClass("hover");
    $(".encounter").removeClass("hover-highlight");
    tip.hide(d3.select(el).data()[0], el); 
  }
  function mouseEnterEncounter(el) {
    var $encG = $(el).parent(),
        hoverAction = $hover.val(),
        enc, $hoverHighlight;
    // The .appendTo()'s here move hovered <rect>'s to the end of the parent so they draw on top
    $(el).addClass("hover").appendTo($encG);
    enc = d3.select(el).data()[0];
    hoverAction && tip.show(enc, el);
    if (hoverAction == 'unit') { 
      $hoverHighlight = $(".encounter.dept-" + fixForClass(enc.department_name)).not(el)
    } else if (hoverAction == 'patient') {
      $hoverHighlight = $(".encounter.erap-" + fixForClass(enc.eRAP_ID)).not(el)
    }
    if ($hoverHighlight) { $hoverHighlight.addClass("hover-highlight").appendTo($encG); }
  }
  function mouseLeaveIsolate(el) {
    $(".hover.isolate, .hover.isolate-metadata").removeClass("hover");
  }
  function mouseEnterIsolate(el) {
    var iso = d3.select(el).data()[0];
    $(".isolate-" + fixForClass(iso.name)).addClass("hover");
  }
  function clickIsolate(el, reset) {
    var iso = d3.select(el).data()[0],
      numSymbols = d3.svg.symbolTypes.length;
    iso.symbolRadius = reset ? nodeRadius : nodeRadius * 1.5;
    iso.symbol = reset ? 0 : (((iso.symbol || 0) - 1) + numSymbols) % numSymbols;
    $timeline.trigger("updateSymbols");
    tree.update();
  }
  
  // We have to set up custom mouse event handlers, using `document.elementFromPoint`, because
  // the timeline has a `<rect class="zoom-rect"/>` in front of it to capture mouse events for the zoom
  // interaction. These functions recalculate mouseover/out/click targets with the zoom-rect hidden.
  var prevHoverEl = null;
  $timeline.on("mousemove", function(e) {
    var prevDisplay = $(".zoom-rect").css("display"),
        $prevHoverEl = $(prevHoverEl),
        el;
    $(".zoom-rect").css("display", "none");
    el = document.elementFromPoint(e.clientX, e.clientY);
    if (el !== prevHoverEl) {
      // mouseleave actions
      if ($prevHoverEl.hasClass("encounter")) { mouseLeaveEncounter(prevHoverEl); }
      else if ($prevHoverEl.hasClass("isolate")) { mouseLeaveIsolate(prevHoverEl); }
      // mouseenter actions
      if ($(el).hasClass("encounter")) { mouseEnterEncounter(el); } 
      else if ($(el).hasClass("isolate")) { mouseEnterIsolate(el); }
      prevHoverEl = el;
    }
    $(".zoom-rect").css("display", prevDisplay);
  });
  $timeline.on("mouseleave", function(e) {
    var $prevHoverEl = $(prevHoverEl);
    if ($prevHoverEl.hasClass("encounter")) { mouseLeaveEncounter(prevHoverEl); }
    else if ($prevHoverEl.hasClass("isolate")) { mouseLeaveIsolate(prevHoverEl); }
    prevHoverEl = null;
  });
  $timeline.on("click", function(e) {
    var prevDisplay = $(".zoom-rect").css("display"),
        el;
    $(".zoom-rect").css("display", "none");
    el = document.elementFromPoint(e.clientX, e.clientY);
    if ($(el).hasClass("isolate")) { clickIsolate(el, e.altKey); }
    $(".zoom-rect").css("display", prevDisplay);
  });
  
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
  
  function resizeTimelineWidth(isolates, encounters, paddingLeft, xScale, zoom) {
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
    minDate = _.min(_.pluck(encounters, 'start_time').concat(_.pluck(isolates, 'ordered'))),
    maxDate = _.max(_.pluck(encounters, 'end_time').concat(_.pluck(isolates, 'ordered'))),
    oneDayInPx = xScale(d3.time.day.offset(now, 1)) - xScale(now),
    zoomOutLimit = (xScale.domain()[1] - xScale.domain()[0]) / (maxDate - minDate),
    zoom.scaleExtent([zoomOutLimit, 50 / oneDayInPx])
    
    $timeline.attr("width", paddingLeft + width);
    $timeline.find(".pt-dividers rect").attr("width", width);
    $timeline.find(".pt-dividers text").attr("x", width - yAxisPadding);
    $timeline.find(".zoom-rect").attr("width", width - yAxisSize);
    $timeline.find(".y.axis").attr("transform", "translate(" + (width - yAxisSize + yAxisPadding) + ",0)");
    $('#timeline-clip rect').attr("width", width - yAxisSize);
  }
  
  function createSortKeys(encounters, isolates) {
    // sortKeys allows the (eRAP_ID, dept) tuples to be sorted by values other than themselves
    // Each member of the sortKeys array maps to the corresponding index of the tuples.
    //  => 0 = eRAP_ID; 1 = department_name/collection_unit
    var sortKeys = [{}, null];
    // The following causes eRAP_IDs to sort by the first isolate date for that eRAP_ID
    _.each(isolates, function(iso) { 
      sortKeys[0][iso.eRAP_ID] = Math.min(iso.ordered, sortKeys[0][iso.eRAP_ID] || Infinity); 
    });
    _.each(sortKeys[0], function(v, k) {
      // Use the ISO date which sorts alphanumerically; still need the eRAP_ID for tiebreaker
      sortKeys[0][k] = (_.isNaN(v) ? "9999-01-01" : (new Date(v)).toISOString()) + "\n" + k.toString();
    });
    return sortKeys;
  }
  
  function setupYScaleAndGroups(tuples, yScale, rowHeight, padGroups, sortKeys) {
    var yGroups = [],
      // yGrouping is a specification "#,#" of the order for sorting the (eRAP_ID, dept) tuples
      //  => 0 = eRAP_ID; 1 = department_name/collection_unit; leftmost number takes precedence
      yGrouping = _.map($yGrouping.val().split(","), parseInt10),
      selector = function(tup) { return _.map(yGrouping, function(i) { return tup[i]; }) },
      paddedDomain = [],
      domain, height, prevGroup;
    
    sortKeys = sortKeys || [];
    domain = _.uniq(_.map(tuples, selector), false, stringifyTuple);
    domain = _.sortBy(domain, function(tup) { 
      return stringifyTuple(_.map(tup, function(v, i) { 
        return sortKeys[yGrouping[i]] ? sortKeys[yGrouping[i]][v] : v;
      }));
    });
    
    if (padGroups) {
      _.each(domain, function(tup, i) { 
        if(i > 0 && tup[0] != prevGroup) { paddedDomain.push([prevGroup, null]); }
        paddedDomain.push(tup);
        prevGroup = tup[0];
      });
      paddedDomain.push([prevGroup, null]);
      domain = paddedDomain;
    }
    height = domain.length * rowHeight;
    yScale.rangePoints(padGroups ? [0.5 * rowHeight, height - rowHeight * 0.5] : [0, height - rowHeight]);
    yScale.domain(domain);
    
    _.each(domain, function(tup) {
      if (!yGroups.length || _.last(yGroups).label !== tup[0]) {
        var initialLength = (yGrouping.length == 1 && padGroups ? 2 : 1);
        yGroups.push({label: tup[0], start: tup, end: tup, length: initialLength});
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
        padGroups = true,
        zoomCache = {last: null},
        erapIdDeptTuples = _.map(drawableEncounters, function(enc) { 
          return [enc.eRAP_ID, enc.department_name];
        }).concat(_.map(isolates, function(iso) {
          return [iso.eRAP_ID, iso.collection_unit];
        })),
        sortKeys = createSortKeys(encounters, isolates),
        yGroups, height, yScale, yScaleGrouped;
    
    // Every time we call `updateTimeline()` the `#timeline` svg is cleared and rebuilt
    $timeline.children(':not(defs)').remove();
    
    // Setup Y scale and grouping
    yScale = d3.scale.ordinal();
    yGroups = setupYScaleAndGroups(erapIdDeptTuples, yScale, rowHeight, padGroups, sortKeys);
    height = _.last(yScale.range()) + rowHeight;
    yScaleGrouped = function(tup) { return yScale(yGroups.selector(tup)); }
    
    // Setup X scale and axis
    var xScale = d3.time.scale.utc().domain(orderedScale.domain()).nice();
    resizeTimelineWidth(isolates, encounters, paddingLeft, xScale, false);
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
        .attr("class", "pt-dividers noselect");
                
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
        encFill = colorByFunctions.encounters[$colorBy.val()];
        encClass = function(enc) {
          var cls = enc.encounter_type == "Hospital Encounter" ? "encounter inpatient" : "encounter outpatient";
          cls += " dept-" + fixForClass(enc.department_name);
          cls += " erap-" + enc.eRAP_ID;
          return cls;
        }
    plotAreaG.append("g")
        .attr("class", "encounters")
      .selectAll("rect")
        .data(drawableEncounters)
      .enter().append("rect")
        .attr("class", encClass)
        .attr("height", rowHeight)
        .style("fill", encFill)
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
        isolateFill = colorByFunctions.isolates[$colorBy.val()],
        isolateStroke = function(iso) { return d3.rgb(isolateFill(iso)).darker().toString(); };
    plotAreaG.append("g")
        .attr("class", "isolates")
      .selectAll("path")
        .data(_.filter(isolates, function(iso) { return !!iso.ordered; }))
      .enter().append("path")
        .attr("class", function(iso) { return "isolate isolate-" + fixForClass(iso.name); })
        .attr("d", isolatePath)
        .style("fill", isolateFill)
        .style("stroke", isolateStroke);
    
    // Create a placeholder for Y axis labels
    timelineSvg.append("g")
        .attr("class", "y axis noselect");
    
    // Add a clipping mask so data that moves outside the plot area is clipped
    timelineSvg.append("clipPath")
        .attr("id", "timeline-clip")
      .append("rect")
        .attr("height", height);
    
    // Invisible <rect> in front of the plot to capture zoom mouse/touch events
    // Note that the 
    var zoomRect = timelineSvg.append("rect")
        .attr("class", "zoom-rect")
        .attr("height", height)
        .attr("fill", "none")
        .attr("pointer-events", "all")
        .call(zoom);
    
    // Bind event handler to redraw axes/data after zooming/panning along the X axis
    $timeline.unbind("zoomX").on("zoomX", function(e, reorderingY) {
      var e = d3.event || zoomCache.last;
      // NOTE: we used to transform parent <g>'s directly from the d3.event calculations, e.g.
      //   .attr("transform", "translate(" + e.translate[0] + "," + "0)scale(" + e.scale + ",1)");
      // but this no longer works after adding the `resizeWidth` event, as that resets `zoom`.
      // Now, we have to reposition every datapoint.
      xAxis.ticks(Math.floor($timeline.find(".zoom-rect").width() / 100));
      timelineSvg.select("g.x.axis").call(xAxis);
      if (!reorderingY) {
        timelineSvg.select(".isolates").selectAll("path")
            .attr("transform", function(iso) { return 'translate(' + isolateX(iso) + ',' + isolateY(iso) + ')'; } );
      }
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
      var duration = 0,
          prevHeight = parseInt10(d3.select("#timeline").attr("height")),
          height;
      if (!firstDraw) {
        yGroups = setupYScaleAndGroups(erapIdDeptTuples, yScale, rowHeight, padGroups, sortKeys);
        duration = 500;
      }
      height = _.last(yScale.range()) + rowHeight;
      d3.select("#timeline").attr("height", Math.max(height + xAxisSize, prevHeight))
      xAxis.tickSize(-height, 0);
      
      timelineSvg.classed("single-groups", yGroups.grouping.length === 1)
          .classed("grouping-by-pt", yGroups.grouping[0] === 0);
      var ptDividersGG = ptDividersG.selectAll("g").data(yGroups, function(grp) { return grp.label; });
      ptDividersGG.exit().remove();
      
      var ptDividersGEnter = ptDividersGG.enter().append("g");
      ptDividersGEnter.append("rect")
          .attr("x", 0);
      ptDividersGEnter.append("text")
          .attr("text-anchor", "end")
          .attr("dy", rowHeight * 0.5);
          
      ptDividersGG.select("rect").transition().duration(duration)
          .attr("y", function(yGroup) { return yScale(yGroup.start) - (padGroups ? 0.5 : 0) * rowHeight; })
          .attr("height", function (yGroup) { return rowHeight * yGroup.length; });
      ptDividersGG.select("text")
          .attr("y", function(yGroup) { 
            return yScale(yGroup.start) + rowHeight * (yGroup.length * 0.5 + (padGroups ? -0.5 : 0));
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
      plotAreaG.select(".isolates").selectAll("path").transition().duration(duration)
          .attr("transform", function(iso) { return 'translate(' + isolateX(iso) + ',' + isolateY(iso) + ')'; } );
          
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
      d3.select("#timeline-clip").select("rect").transition().duration(duration)
          .attr("height", height);
    });
    
    // Bind event handler to resize the timeline after resizing the browser window
    $timeline.unbind("resizeWidth").on("resizeWidth", function(e, reorderingY) {
      resizeTimelineWidth(isolates, encounters, paddingLeft, xScale, zoom);
      $timeline.trigger("zoomX", reorderingY);
    });
    
    // Bind event handler for updating isolate symbols when clicking them
    $timeline.unbind("updateSymbols").on("updateSymbols", function() {
      timelineSvg.select(".isolates").selectAll("path")
          .attr("d", isolatePath);
    });

    $timeline.trigger("reorderY", true);
    $timeline.trigger("resizeWidth");
  }
  
  // If there are more than three patients, initially collapse the timeline vertically to save space
  $yGrouping.val(_.pluck(isolates, 'eRAP_ID').length > 3 ? "0" : "0,1");
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
    $timeline.trigger("resizeWidth", true);
  });
  
  $variantLabels.change(updateVariantLabels);
  $variantNtOrAa.change(function() {
    updateVariantLabels();
    tree.update();
  });
  
  $(window).resize(function() {
    $timeline.trigger("resizeWidth");
  });
  
  var fixColorScaleAfter = $('#color-scale').position().top;
  if (navbar) { 
    fixColorScaleAfter -= $(navbar).height();
  }
  
  $(window).scroll(function() {
    var fixed = $(this).scrollTop() > fixColorScaleAfter;
    $dendroTimeline.toggleClass('fixed', fixed);
    $('#color-scale').css({
      top: fixed && navbar ? $(navbar).height() : 0,
      left: fixed ? 80 - $(this).scrollLeft() : '',
    });
  });
}