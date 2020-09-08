function dendroTimeline(prunedTree, isolates, encounters, variants, epi, navbar) {
  // Global constants.
  var COLORS = ["#511EA8", "#4928B4", "#4334BF", "#4041C7", "#3F50CC", "#3F5ED0", "#416CCE", 
    "#4379CD", "#4784C7", "#4B8FC1", "#5098B9", "#56A0AF", "#5CA7A4", "#63AC99", "#6BB18E", 
    "#73B583", "#7CB878", "#86BB6E", "#90BC65", "#9ABD5C", "#A4BE56", "#AFBD4F", "#B9BC4A", 
    "#C2BA46", "#CCB742", "#D3B240", "#DAAC3D", "#DFA43B", "#E39B39", "#E68F36", "#E68234", 
    "#E67431", "#E4632E", "#E1512A", "#DF4027", "#DC2F24"];
  var UNKNOWN_COLOR = "#AAA";
  var NODE_RADIUS = 4;
  var TOLERANCE_STEPS = _.range(24).concat(_.range(1, 14)).concat(_.range(14, 73, 7));
  var TOLERANCE_UNITS = _.times(24, function() { return "hrs"; })
      .concat(_.times(TOLERANCE_STEPS.length - 24, function() { return "days"; }));
  var TOLERANCE_DEFAULT = 12;
  var $LOADING_SPINNER = $('.loading'),
      $LOADING_SPINNER_TEXT = $('.loading-text');
  
  // Specifies URL query parameters that should map to DOM element values
  //     (see `syncQueryParamsToDOM` in utils.js for more details)
  // Some of the parameters have `false` getterSetters as they are not reflected directly in the DOM
  //     e.g. db is passed in from externally; others need to be defined later in this script
  var queryParamSpec = {
    db: false,
    assemblies: false,
    colorNodes: true, 
    filter: true, 
    timelineGrouping: true, 
    isolateTests: true, 
    variantLabels: true,
    variantNtOrAa: true,
    showOverlaps: false, // A custom getterSetter for this button is defined later
    tolerance: true,
    sort: false // Preserves manual dragging of timeline rows; also defined later
  };
  var syncDOMToQueryParamsDebounced = _.debounce(syncDOMToQueryParams, 200);
  
  // Utility functions for formatting various fields for display, or generating symbols for isolates/tests
  var FORMAT_FOR_DISPLAY = {
    start_time: function(d) { return d.toLocaleString(); },
    from_time: function(d) { return d.toLocaleString(); },
    end_time: function(d) { return d.toLocaleString(); },
    to_time: function(d) { return d.toLocaleString(); },
    test_date: function(d) { return d.toLocaleString(); },
    num_days: function(d) {
      var desc = d > 0 ? "for " : "within ";
      var hours = Math.abs(d) * 24, 
          days = Math.floor(hours / 24);
      if (days > 0) { desc += days + "d "; hours -= days * 24; }
      return desc + Math.ceil(hours) + "h"; 
    },
    order_date: function(d) { return _.isString(d) ? d.replace(/[ T].*/g, '') : d; },
    unit: fixUnit,
    collection_unit: fixUnit,
    gene: function(d) { 
      if ((/^\d+$/).test(d)) { return d + ' genes'; }
      return d.replace(/^PROKKA_/, 'P_'); 
    },
    chrom: function(d) { 
      if ((/^u\d{5}crpx_c_/).test(d)) { return "chromosome"; }
      if ((/^u\d{5}crpx_p_/).test(d)) { return "plas."; }
      if ((/^u\d{5}[a-z]{4}_[a-z]_/).test(d)) { return "other"; }
      return d; 
    },
    taxonomy_ID: function(d) { return epi.organisms[d] ? epi.organisms[d] : ""; },
    contig_N50: numberWithCommas,
    contig_maxlength: numberWithCommas
  };
  function symbolLineX(radius) {
    d = radius / Math.sqrt(2);
    return ["M-", ",-", "L", ",", "M-", ",", "L", ",-", ""].join(d);
  }
  function symbolDiamond(radius) {
    d = radius / Math.sqrt(2);
    return ["M0,-", "L", ",0L0,", "L-", ",0L0,-","L0,-", ""].join(d);
  }
  function isolateSymbolPath(iso) { 
    var radius = iso.symbolRadius || NODE_RADIUS;
    return d3.svg.symbol().size(Math.PI * radius * radius).type(d3.svg.symbolTypes[iso.symbol || 0])(); 
  };
  function isolateTestSameSpecies(test) { 
    return test.negative || !!epi.taxonomy_IDs[test.taxonomy_ID]; 
  }
  function isolateTestSymbolPath(test) { 
    var negative = !!test.negative,
        circle = d3.svg.symbol().size(Math.PI * NODE_RADIUS * NODE_RADIUS).type("circle");
    return negative ? symbolLineX(NODE_RADIUS / 1.5) : (
          isolateTestSameSpecies(test) ? circle() : symbolDiamond(NODE_RADIUS / 1.2)
        );
  };

  // D3 scales, formats, and other helpers that are used globally
  var spectralScale = d3.scale.linear()
      .domain(_.range(COLORS.length))
      .interpolate(d3.interpolateHcl)
      .range(_.map(COLORS, function(v) { return d3.rgb(v); }));
  var orderedScale = d3.time.scale()
      .range([0, COLORS.length - 1]);
  var orderedFormat = d3.time.format("%b %Y");
  var collectionUnitScale = d3.scale.ordinal()
      .domain(_.uniq(_.compact(_.pluck(isolates, 'collection_unit'))).sort())
      .rangePoints([0, COLORS.length - 1]);
  var isLeafNode = d3.layout.phylotree.is_leafnode;
  var colorByFunctions = {
    isolates: {
      ordered: function(isolate) { 
        return isolate.ordered ? spectralScale(orderedScale(isolate.ordered)) : UNKNOWN_COLOR; 
      },
      collection_unit: function(isolate) {
        return isolate.collection_unit ? spectralScale(collectionUnitScale(isolate.collection_unit)) : 
            UNKNOWN_COLOR;
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
  
  // D3 tooltip object
  function tipHtml(d) {
    if (d.referenceGenomeInfo) { return tipGenomeInfoHtml(d); }
    if (!_.isUndefined(d.assembly_ID)) { return tipIsolateHtml(d); }
    if (_.isArray(d) && d.length > 0 && d[0].test_ID) { return tipIsolateTestsHtml(d); }
    if (d.from_eRAP_ID) { return tipOverlapHtml(d); }
    return tipEncHtml(d);
  }
  
  var tip = d3.tip()
      .attr("class", "d3-tip")
      .offset([-10, 0])
      .html(tipHtml);
  
  // jQuery objects for controls that can update the visualization
  var $colorBy = $('#color-nodes');
  var $dendroTimeline = $('#dendro-timeline');
  var $filter = $('#filter');
  var $timeline = $('#timeline');
  var $yGrouping = $('#timeline-grouping');
  var $hover = $('#hover');
  var $variantLabels = $('#variant-labels');
  var $variantNtOrAa = $('#variant-nt-or-aa');
  var $showOverlaps = $('#show-overlaps');
  var $tolerance = $('#tolerance');
  var $toleranceNum = $('#tolerance-num');
  var $toleranceUnits = $('#tolerance-units');
  var $isolateTests = $('#isolate-tests');
  
  // Fades out the loading spinner
  var fadeOutSpinnerDebounced = _.debounce(function() { $LOADING_SPINNER.fadeOut(); }, 300);
  // Change the loading spinner caption since at this point all data has been downloaded for the first draw
  $LOADING_SPINNER_TEXT.text('redrawing data');
  
  // ======================================================================================
  // = Impute locations for isolate test results (unsequenced positive/negative cultures) =
  // ======================================================================================
  
  // FIXME: Now that we have proper collection_unit data for each isolate test result, can deprecate this.
  function imputeTestResultLocations(testResults, encounters) {
    var encountersByPt = _.groupBy(encounters, 'eRAP_ID');
    _.each(testResults, function(result) {
      var ptEncs = encountersByPt[result.eRAP_ID] || [],
        testTime = result.test_date,
        nearestPtEncs;
      // Sorts encounters for this patient by...
      //   - Longest encounter overlapping the testTime, followed by
      //   - Closest encounter to the testTime, from either start or end (whichever is closer).
      nearestPtEncs = _.sortBy(ptEncs, function(enc) { 
        if (testTime >= enc.start_time && testTime < enc.end_time) {
          return -(enc.end_time - enc.start_time);
        } else if (testTime < enc.start_time) {
          return enc.start_time - testTime;
        }
        return testTime - enc.end_time;
      });
      // After sorting, use the first (best/closest) encounter for imputing location.
      if (nearestPtEncs.length > 0) {
        result.imputed_unit = nearestPtEncs[0].department_name;
      }
    });
  }
  if (epi && _.isArray(epi.isolate_test_results)) {
    imputeTestResultLocations(epi.isolate_test_results, encounters);
    
    epi.isolate_tests_by_id = {};
    _.each(epi.isolate_test_results, function(res) { 
      if (res.isolate_ID) { 
        epi.isolate_tests_by_id[res.isolate_ID] = epi.isolate_tests_by_id[res.isolate_ID] || [];
        epi.isolate_tests_by_id[res.isolate_ID].push(res); 
      }
    });
  }
  
  
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
  var max_eRAP_ID_length = _.max(_.map(isolates, function(iso) { return iso.eRAP_ID.toString().length; })),
      eRAP_ID_width = max_eRAP_ID_length * 7 + 12,
      max_unit_length = _.max(_.map(isolates, function(iso) { return iso.collection_unit.length; })),
      unit_width = max_unit_length * 9 + 12;
  var isolateColumns = [
    ["isolate_ID", 0, "Isolate ID"],
    ["eRAP_ID", 62, "Pt ID"],
    ["order_date", 62 + eRAP_ID_width, "Order Date"],
    ["collection_unit", 62 + eRAP_ID_width + 73, "Unit"]
  ];
  var variantsX = 62 + eRAP_ID_width + 73 + unit_width, variantHeight = 15, variantWidth = 14;
  var variantMapPadRatio = 0.2, variantMapStepback = 5,
      variantMapContigHeight = 12, minVariantMapWidth = 200;
  
  // Scale up branch lengths to SNVs per **Mbp** core genome
  tree.branch_length(function() { return oldBranchLength.apply(this, arguments) * 1000000; })
  
  if (variants.allele_info) {
    // Tells phylotree to pretend that the branch_names are super long, so it adds extra width to the SVG
    // see https://github.com/veg/phylotree.js/blob/master/examples/leafdata/index.html
    tree.branch_name(function(node) {
      return Array(Math.floor(Math.max(variants.allele_info.length, 10) * 1.8 + variantsX / 5.5)).join(" ");
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
          .on("click", function() { 
            clickIsolate(d3.event.target, d3.event.altKey || d3.event.shiftKey); 
          });
      symbol.attr("d", isolateSymbolPath(isolate))
          .attr("transform", "translate(" + (isolate.symbolRadius || NODE_RADIUS) + ',0)')
          .style("fill", fillColor)
          .style("stroke", strokeColor);
      
      // Add columns of textual metadata according to the spec in `isolateColumns`
      texts.exit().remove();
      texts.enter().append("text")
      texts.attr("x", function(d) { return NODE_RADIUS * 2.5 + d[1]; })
          .attr("class", "isolate-metadata isolate-" + fixForClass(isolate.name))
          .attr("transform", "translate(" + shiftTip + ",0)")
          .attr("dx", NODE_RADIUS)
          .attr("dy", NODE_RADIUS)
          .style("font-size", "12px")
          .text(function(d) {
            var val = isolate[d[0]];
            return FORMAT_FOR_DISPLAY[d[0]] ? FORMAT_FOR_DISPLAY[d[0]](val) : val;
          });
          
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

  // =================================================================================
  // = Plot metadata labels, variant labels and the genome map next to the phylotree =
  // =================================================================================
  
  function updateIsolateColumnLabels() {
    var bbox = getBBox(d3.select("#dendro .isolate-metadata"));
    
    columnLabelsG = d3.select('#dendro .column-labels');
    if (columnLabelsG.node() === null) { 
      columnLabelsG = d3.select('#dendro').append("g").attr("class", "column-labels");
      columnLabelsG.attr("transform", "translate(" + bbox.x + "," + bbox.y + ")"); 
    }
    
    labelTexts = columnLabelsG.selectAll("text").data(isolateColumns);
    labelTexts.exit().remove();
    labelTexts.enter().append("text")
        .attr("class", "axis-label")
        .attr("x", function(d) { return d[1]; })
        .attr("dy", -5)
        .text(function(d) { return d[2]; })
  }
  updateIsolateColumnLabels();

  function updateVariantLabels() {
    if (!variants.by_assembly || !variants.allele_info) { return; }
    
    var variantLabelsSvg = d3.select("#dendro-variant-labels"),
        whichLabel = $variantLabels.val().split('+'),
        ntOrAa = $variantNtOrAa.val(),
        formatter = whichLabel[0] == 'chrom' ? null : FORMAT_FOR_DISPLAY[whichLabel[0]],
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
          if (whichLabel[1] == 'pos' && out) {
            if (whichLabel[0] == 'gene' && !(/^\d+/).test(out)) {
              // Note: NT and AA pos are ZERO-indexed in the .vcf.npz, but we display them as 1-indexed
              out += ":" + (ntOrAa == 'aa' ? 'p' : 'c') + "." + (d[ntOrAa + '_pos'] + 1); 
            } else {
              out += ":" + d['pos'];
            }
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
        .text(function(d) { return FORMAT_FOR_DISPLAY.chrom(d.chrom); });
    
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
  
  d3.select("#timeline").call(tip);
  
  function createTipTableRows(rowSpec, datum) {
    var html = [];
    _.each(rowSpec, function(label, k) {
      var val = datum[k];
      if (FORMAT_FOR_DISPLAY[k]) { val = FORMAT_FOR_DISPLAY[k](val); }
      if (!_.isUndefined(val) && val !== null && val !== "") {
        html.push('<tr><td class="row-label">' + label + '</td><td>' + val + '</td></tr>');
      }
    });
    return html.join('');
  }
  
  // ** 
  // ** Encounters (horizontal bars)
  // ** 
  
  // Generates tooltip HTML for a given encounter datum, using the tipEncRows spec
  var tipEncRows = {
        department_name: "Unit",
        eRAP_ID: "Anon Pt ID",
        encounter_type: "Encounter Type",
        start_time: "Start Time", 
        end_time: "End Time",
        transfer_to: "Pt Transfers To"
      };
  function tipEncHtml(d) {
    return '<table class="link-info enc-info">' + createTipTableRows(tipEncRows, d) + '</table>';
  }
  function mouseLeaveEncounter(el) {
    $(el).removeClass("hover");
    $(".encounter").removeClass("hover-highlight");
    tip.hide(d3.select(el).data()[0], el); 
  }
  function mouseEnterEncounter(el) {
    var hoverAction = $hover.val(),
        enc, $hoverHighlight;
    d3.select(el).classed("hover", true).moveToFront();
    enc = d3.select(el).data()[0];
    hoverAction && tip.show(enc, el);
    if (hoverAction == 'unit') { 
      $hoverHighlight = $(".dept-" + fixForClass(enc.department_name) + ".encounter").not(el)
    } else if (hoverAction == 'patient') {
      $hoverHighlight = $(".erap-" + fixForClass(enc.eRAP_ID)+".encounter").not(el)
    }
    if ($hoverHighlight) { 
      d3.selectAll($hoverHighlight.get()).classed("hover-highlight", true).moveToFront();
    }
  }
  
  // ** 
  // ** Isolates (filled symbols on the dendrogram and timeline)
  // ** 
  var tipIsolateRows = {
        isolate_ID: "Isolate ID",
        assembly_ID: "Assembly_ID",
        eRAP_ID: "Anon Pt ID",
        collection_unit: "Unit",
        order_date: "Collection Time",
        mlst_subtype: "MLST",
        contig_count: "# contigs",
        contig_N50: "Contig N50",
        contig_maxlength: "Longest contig"
      },
      tipIsolateExtraRows = {
        procedure_name: "Test Performed",
        test_result: "Result",
        description: "Result Details",
        taxonomy_ID: "Species"
      };
  function tipIsolateHtml(d) {
    var rowsHtml = createTipTableRows(tipIsolateRows, d),
        divider = '<tr class="separator"><td colspan="2"></td></tr>';
    _.each(d.testResults, function(res) {
      rowsHtml += divider + createTipTableRows(tipIsolateExtraRows, res);
    });
    return '<table class="link-info isolate-info">' + rowsHtml + '</table>';
  }
  function mouseLeaveIsolate(el) {
    $(".hover.isolate, .hover.isolate-metadata").removeClass("hover");
    tip.hide(d3.select(el).data()[0], el);
  }
  function mouseEnterIsolate(el) {
    var iso = d3.select(el).data()[0],
        testResultsForIso = epi.isolate_tests_by_id && epi.isolate_tests_by_id[iso.isolate_ID];
    $(".isolate-" + fixForClass(iso.name)).addClass("hover");
    if ($(el).closest('#timeline').length) { 
      tip.show(_.extend({}, iso, {testResults: testResultsForIso}), el); 
    }  
  }
  function clickIsolate(el, reset) {
    var iso = d3.select(el).data()[0],
        numSymbols = d3.svg.symbolTypes.length;
    iso.symbolRadius = reset ? NODE_RADIUS : NODE_RADIUS * 1.5;
    iso.symbol = reset ? 0 : (((iso.symbol || 0) - 1) + numSymbols) % numSymbols;
    $timeline.trigger("updateSymbols");
    // Updates only the clicked node in the dendrogram -- this avoids a (slower) tree.update()
    d3.select('#dendro').select('path.isolate-' + fixForClass(iso.name) + '.isolate')
        .attr("d", isolateSymbolPath(iso))
        .attr("transform", "translate(" + (iso.symbolRadius || NODE_RADIUS) + ',0)');
  }
  
  // ** 
  // ** Overlaps (arcs on the timeline)
  // ** 
  var tipOverlapRows = {
        num_days: "Overlapped",
        department_name: "Unit Involved",
        from_eRAP_ID: "Anon Pt ID 1",
        to_eRAP_ID: "Anon Pt ID 2",
        from_time: "Overlap Starts"
      };
  function tipOverlapHtml(d) {
    return '<table class="link-info overlap-info">' + createTipTableRows(tipOverlapRows, d) + '</table>';
  }
  function mouseLeaveOverlap(el) { 
    $(el).removeClass("hover");
    tip.hide(d3.select(el).data()[0], el);
  }
  function mouseEnterOverlap(el) { 
    $(el).addClass("hover");
    tip.show(d3.select(el).data()[0], el);
  }
  
  // ** 
  // ** Micro test results that were not sequenced (open symbols on the timeline)
  // ** 
  var tipIsolateTestRows = {
        procedure_name: "Test Performed",
        test_result: "Result",
        description: "Result Details",
        taxonomy_ID: "Species",
        eRAP_ID: "Anon Pt ID",
        collection_unit: "Unit",
        test_date: "Collection Time"
      };
  function tipIsolateTestsHtml(d) {
    html = '<table class="link-info isolate-test-info">';
    _.each(d, function(isolateTest, i) {
      if (i > 0) { html += '<tr class="separator"><td colspan="2"></td></tr>'; }
      html += createTipTableRows(tipIsolateTestRows, isolateTest);
    });
    html += '</table>';
    return html;
  }
  function mouseLeaveIsolateTest(el) {
    $(".hover.isolate-test").removeClass("hover");
    tip.hide([d3.select(el).data()[0]], el); 
  }
  function mouseEnterIsolateTest(el) {
    var test = d3.select(el).data()[0],
        sel = ".isolate-test-time-" + Math.floor(test.test_date.getTime() / 1000);
    _.each($yGrouping.val().split(','), function(tupIndex) {
      if (tupIndex == '0') { sel += ".isolate-test-0-" + fixForClass(test.eRAP_ID.toString()); }
      else if (tupIndex == '1') { sel += ".isolate-test-1-" + fixForClass(test.collection_unit); }
    });
    $(sel).addClass("hover");
    tip.show($(sel).map(function() { return d3.select(this).data()[0]; }).get(), el);
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
      else if ($prevHoverEl.hasClass("overlap")) { mouseLeaveOverlap(prevHoverEl); }
      else if ($prevHoverEl.hasClass("isolate-test")) { mouseLeaveIsolateTest(prevHoverEl); }
      // mouseenter actions
      if ($(el).hasClass("encounter")) { mouseEnterEncounter(el); } 
      else if ($(el).hasClass("isolate")) { mouseEnterIsolate(el); }
      else if ($(el).hasClass("overlap")) { mouseEnterOverlap(el); }
      else if ($(el).hasClass("isolate-test")) { mouseEnterIsolateTest(el); }
      prevHoverEl = el;
    }
    $(".zoom-rect").css("display", prevDisplay);
  });
  $timeline.on("mouseleave", function(e) {
    var $prevHoverEl = $(prevHoverEl);
    if ($prevHoverEl.hasClass("encounter")) { mouseLeaveEncounter(prevHoverEl); }
    else if ($prevHoverEl.hasClass("isolate")) { mouseLeaveIsolate(prevHoverEl); }
    else if ($prevHoverEl.hasClass("overlap")) { mouseLeaveOverlap(prevHoverEl); }
    else if ($prevHoverEl.hasClass("isolate-test")) { mouseLeaveIsolateTest(prevHoverEl); }
    prevHoverEl = null;
  });
  $timeline.on("click", function(e) {
    var prevDisplay = $(".zoom-rect").css("display"),
        el;
    $(".zoom-rect").css("display", "none");
    el = document.elementFromPoint(e.clientX, e.clientY);
    if ($(el).hasClass("isolate")) { clickIsolate(el, e.altKey || e.shiftKey); }
    $(".zoom-rect").css("display", prevDisplay);
  });
  
  // ===================================
  // = Setup the timeline in #timeline =
  // ===================================
  
  // Returns a filtered copy of `encounters` with the filter settings applied
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
  
  // Finds all spatiotemporal overlaps between each patient's encounters and any other patients having an
  // earlier positive isolate, with the overlaps separated by up to `tolerance` days.
  // Returns an array of overlaps in the form of:
  // { department_name: String, from_eRAP_ID: String, to_eRAP_ID: String, from_time: Date, 
  //   to_time: Date, width: Number}
  // where `width` is the # of days of overlap, and if negative, is an overlap in the `tolerance` zone.
  function findOverlaps(encounters, isolates, tolerance) {
    var encountersByPt = _.groupBy(encounters, 'eRAP_ID'),
        earliestIsolates = {},
        overlaps = [],
        mSecInDay = 24 * 60 * 60 * 1000;
    tolerance = typeof tolerance == 'number' ? tolerance : 0;
        
    // For each patient, find the earliest isolate (by its ordered time)
    _.each(isolates, function(iso) {
      var eRAP_ID = iso.eRAP_ID && iso.eRAP_ID.toString();
      if (!eRAP_ID || !iso.ordered || !encountersByPt[eRAP_ID]) { return; }
      if (!earliestIsolates[eRAP_ID] || earliestIsolates[eRAP_ID].ordered > iso.ordered) {
        earliestIsolates[eRAP_ID] = iso;
      }
    });
    earliestIsolates = _.sortBy(earliestIsolates, function(iso) { return iso.ordered; });
    
    // For each of these isolates, ...
    _.each(earliestIsolates, function(iso, i) {
      if (i == 0) { return; }
      
      // find all encounters for that isolate's patient before the isolate was collected ...
      earlierEncounters = [];
      _.filter(encounters, function(enc) { 
        if (enc.eRAP_ID.toString() !== iso.eRAP_ID.toString()) { return; }
        if (enc.start_time > iso.ordered) { return; }
        if (enc.end_time > iso.ordered) { 
          enc = _.clone(enc);
          enc.end_time = iso.ordered;
        }
        earlierEncounters.push(enc);
      });
      
      // group them by location,
      earlierEncounters = _.groupBy(earlierEncounters, 'department_name');
      
      // and search for overlaps with any encounters for patients with an earlier positive isolate
      _.each(earliestIsolates.slice(0, i), function(otherIso) {
        _.each(encountersByPt[otherIso.eRAP_ID], function(enc) {
          if (enc.start_time > iso.ordered) { return; }
          if (!enc.department_name || !earlierEncounters[enc.department_name]) { return; }
          
          var startTimePadded = new Date(enc.start_time.getTime() - tolerance * mSecInDay),
              endTimePadded = new Date(enc.end_time.getTime() + tolerance * mSecInDay);
              
          _.each(earlierEncounters[enc.department_name], function (earlierEnc) {
            if (earlierEnc.start_time > endTimePadded) { return; }
            if (earlierEnc.end_time < startTimePadded) { return; }
            
            var startOverlap = new Date(Math.max(earlierEnc.start_time, enc.start_time)),
                endOverlap = new Date(Math.min(earlierEnc.end_time, enc.end_time)),
                avg = new Date((endOverlap.getTime() + startOverlap.getTime()) * 0.5),
                negOverlap = startOverlap > endOverlap,
                fromBefore = negOverlap ? earlierEnc.start_time > enc.start_time : null;
                
            overlaps.push({
              department_name: enc.department_name, 
              from_eRAP_ID: otherIso.eRAP_ID,
              to_eRAP_ID: iso.eRAP_ID,
              from_time: negOverlap ? (fromBefore ? enc.end_time : enc.start_time) : avg,
              to_time: negOverlap ? (fromBefore ? earlierEnc.start_time : earlierEnc.end_time) : avg,
              num_days: (endOverlap.getTime() - startOverlap.getTime()) / mSecInDay
            });
          });
        });
      });
    });
    
    return overlaps;
  }
  
  // Converts the timeline's xScale into the number of pixels corresponding to one day
  function oneDayInPx(xScale) {
    var now = new Date();
    return xScale(d3.time.day.offset(now, 1)) - xScale(now);
  }
  
  // A helper to generate SVG path commands for a left-bending arc for a given spatiotemporal overlap
  function overlapPath(ovlap, xScale, yScaleGrouped, rowHeight, bendFactor) {
    var xFrom = xScale(ovlap.from_time),
        xTo = xScale(ovlap.to_time),
        marginalOverlap = ovlap.num_days < 0,
        width = marginalOverlap ? 2 : ovlap.num_days * oneDayInPx(xScale),
        yFrom = yScaleGrouped([ovlap.from_eRAP_ID, ovlap.department_name]),
        yTo = yScaleGrouped([ovlap.to_eRAP_ID, ovlap.department_name]),
        bend = Math.abs(yFrom - yTo) * bendFactor,
        path;
    yFrom += ((yFrom < yTo) ? 1 : 0) * rowHeight;
    yTo += ((yFrom < yTo) ? 0 : 1) * rowHeight;
    path = "M " + (xFrom - width/2) + "," + yFrom;
    path += " C " + (xFrom - width/2 - bend) + "," + yFrom + " " + (xTo - width/2 - bend) + "," + yTo;
    path += " " + (xTo - width/2) + "," + yTo;
    path += " L " + (xTo + width/2) + "," + yTo;
    path += " C " + (xTo + width/2 - bend) + "," + yTo + " " + (xFrom + width/2 - bend) + "," + yFrom;
    path += " " + (xFrom + width/2) + "," + yFrom;
    path += " L " + (xFrom - width/2) + "," + yFrom;
    return path;
  }
  
  // Called whenever the window is resized to optimize the width and layout of the timeline
  function resizeTimelineWidth(paddingLeft, xScale, zoom) {
    var yAxisPadding = 8,
        yAxisSize = 250,
        paddingRight = 80,
        width = $timeline.parent().innerWidth() - paddingLeft - paddingRight,
        oldXScale = xScale.copy(),
        minEncDate, maxEncDate, zoomOutLimit;
    
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
    zoomOutLimit = (xScale.domain()[1] - xScale.domain()[0]) / (maxDate - minDate),
    zoom.scaleExtent([zoomOutLimit, 50 / oneDayInPx(xScale)])
    
    $timeline.attr("width", paddingLeft + width);
    $timeline.find(".pt-dividers rect").attr("width", width);
    $timeline.find(".pt-dividers text").attr("x", width - yAxisPadding);
    $timeline.find(".zoom-rect").attr("width", width - yAxisSize);
    $timeline.find(".y.axis").attr("transform", "translate(" + (width - yAxisSize + yAxisPadding) + ",0)");
    $('#timeline-clip rect').attr("width", width - yAxisSize);
  }
  
  // Creates a default sorting for encounters and isolates
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
  
  // For a given set of tuples that will be used as the Y axis, apply the grouping settings in $yGrouping,
  // and sort them using `sortKeys` <-- see `createSortKeys()` above
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
  
  // This allows the new timeline sortings created by dragging to be preserved across UI updates
  // Intended to be merged together with _.extend({}, ...) before passing to `setupYScaleAndGroups()`
  var defaultSortKeys = createSortKeys(encounters, isolates),
      draggedSortKeys = {};
  var xScale = d3.time.scale.utc().domain(orderedScale.domain()).nice();
  
  // Adds the ability to preserve timeline sortings across page loads in the URL parameter `sort`
  queryParamSpec.sort = function(val) {
    if (!_.isUndefined(val) && !_.isNull(val)) {
      var oldVal = JSONCrush(JSON.stringify(draggedSortKeys), true);
      if (oldVal != val) {
        draggedSortKeys = JSON.parse(JSONUncrush(val));
        updateTimeline();
      }
    }
    return JSONCrush(JSON.stringify(draggedSortKeys), true);
  }
  
  // Updates the timeline given the current encounter filtering, Y axis, and isolate color settings
  function updateTimeline() {
    var rowHeight = 10,
        xAxisSize = 20,
        paddingLeft = 40,
        padGroups = true,
        padRowTop = rowHeight * (padGroups ? -0.5 : 0),
        overlapBend = 0.15,
        zoomCache = {last: null},
        draggingRow = {},
        drawableEncounters = filterEncounters(encounters, $filter.val()),
        transfers = _.filter(drawableEncounters, function(enc) { return !!enc.transfer_to; }),
        erapIdDeptTuples = _.map(drawableEncounters, function(enc) { 
          return [enc.eRAP_ID, enc.department_name];
        }).concat(_.map(isolates, function(iso) {
          return [iso.eRAP_ID, iso.collection_unit];
        })).concat(_.map(epi.isolate_test_results || [], function(test) {
          return [test.eRAP_ID, test.collection_unit];
        })),
        toleranceUnits = $toleranceUnits.text() == 'hrs' ? 24 : 1,
        overlaps = findOverlaps(drawableEncounters, isolates, $toleranceNum.val() / toleranceUnits),
        yGroups, height, yScale, yScaleGrouped, sortKeys;
    
    // Every time we call `updateTimeline()` the `#timeline` svg is cleared and rebuilt
    $timeline.children(':not(defs)').remove();
    
    // Setup Y scale and grouping
    yScale = d3.scale.ordinal();
    sortKeys = _.extend({}, defaultSortKeys, draggedSortKeys);
    yGroups = setupYScaleAndGroups(erapIdDeptTuples, yScale, rowHeight, padGroups, sortKeys);
    height = _.last(yScale.range()) + rowHeight;
    yScaleGrouped = function(tup) { return yScale(yGroups.selector(tup)); }
    
    // Setup X scale and axis
    resizeTimelineWidth(paddingLeft, xScale, false);
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
    var rowDividersG = timelineSvg.append("g")
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
        
    // Draw spatiotemporal overlaps
    plotAreaG.append("g")
        .attr("class", "overlaps")
        .attr("opacity", 1)
      .selectAll("path")
        .data(overlaps)
      .enter().append("path")
        .classed("overlap", true)
        .classed("marginal", function(ov) { return ov.width < 0; })
        .attr("d", function(ov) { return overlapPath(ov, xScale, yScaleGrouped, rowHeight, overlapBend); });
    plotAreaG.select(".overlaps").selectAll("path")
        .sort(function(a, b) { return b.width - a.width; });
    
    // Draw isolate test results (unsequenced positive/negative cultures)
    var isolateTestX = function(test) { return xScale(test.test_date); },
        isolateTestY = function(test) { 
          return yScaleGrouped([test.eRAP_ID, test.collection_unit]) + rowHeight * 0.5;
        },
        isolateTestClass = function(test) { 
          var cls = "isolate-test isolate-test-time-" + Math.floor(test.test_date.getTime() / 1000);
          cls += " isolate-test-0-" + fixForClass(test.eRAP_ID.toString());
          cls += " isolate-test-1-" + fixForClass(test.collection_unit);
          return cls;
        };
    plotAreaG.append("g")
        .attr("class", "isolate-tests")
      .selectAll("path")
        .data(epi.isolate_test_results || [])
      .enter().append("path")
        .attr("class", isolateTestClass)
        .classed("same-species", isolateTestSameSpecies)
        .attr("d", isolateTestSymbolPath);
    
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
        .attr("d", isolateSymbolPath)
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
        timelineSvg.select(".isolate-tests").selectAll("path")
            .attr("transform", function(test) { 
              return 'translate(' + isolateTestX(test) + ',' + isolateTestY(test) + ')';
            });
        timelineSvg.select(".isolates").selectAll("path")
            .attr("transform", function(iso) { return 'translate(' + isolateX(iso) + ',' + isolateY(iso) + ')'; } );
        timelineSvg.select(".overlaps").selectAll("path")
            .attr("d", function(ov) { return overlapPath(ov, xScale, yScaleGrouped, rowHeight, overlapBend); });
      }
      timelineSvg.select(".encounters").selectAll("rect")
          .attr("x", encX)
          .attr("width", encWidth);
      timelineSvg.select(".transfers").selectAll("line")
          .attr("x1", function(enc) { return xScale(enc.end_time); })
          .attr("x2", function(enc) { return xScale(enc.end_time); });
      if (d3.event) { zoomCache.last = d3.event; }
    });
    
    // Helper function for binding drag events to each row divider of the timeline
    // This allows them to be dragged vertically to rearrange the timeline
    function updateRowDragInteractions(rowDividersGG, yDividerTop, yDividerCenter, redrawRows, height) {
      var dragBehavior = d3.behavior.drag()
          .origin(function(yGrp) { 
            return { y: yDividerTop(yGrp) };
          })
          .on("dragstart", function(yGrp) {
            $(document.body).addClass("dragging-row");
            draggingRow[yGrp.label] = yDividerTop(yGrp);
            d3.select(this).classed("dragging", true).moveToFront();
          })
          .on("drag", function(yGrp) {
            var rowDividers = d3.select(this.parentNode).selectAll("g"),
                sortKeys, yCenter;
            draggingRow[yGrp.label] = Math.min(height, Math.max(-rowHeight, d3.event.y));
            yCenter = draggingRow[yGrp.label] + rowHeight * yGrp.length * 0.5
            draggedSortKeys[yGroups.grouping[0]] = {};
            rowDividers.each(function(sibYGrp) {
              // Sort keys post-drag are pixel position. The +0.5 pixel here prevents ties *while* dragging.
              var sortKey = sibYGrp.label === yGrp.label ? (yCenter + 0.5) : yDividerCenter(sibYGrp);
              draggedSortKeys[yGroups.grouping[0]][sibYGrp.label] = numberWithLeadingZeros(sortKey, 10);
            });
            sortKeys = _.extend({}, defaultSortKeys, draggedSortKeys);
            yGroups = setupYScaleAndGroups(erapIdDeptTuples, yScale, rowHeight, padGroups, sortKeys);
            redrawRows(rowDividers, 150, this);
          })
          .on("dragend", function(yGrp) {
            $(document.body).removeClass("dragging-row");
            delete draggingRow[yGrp.label];
            d3.select(this).classed("dragging", false);
            redrawRows(d3.select(this.parentNode).selectAll("g"), 150);
            // saves the new sort order to the `sort` URL param
            syncDOMToQueryParamsDebounced(queryParamSpec);
          });
      
      rowDividersGG.on(".drag", null).call(dragBehavior);
    }
    
    // Bind event handler to reorder the yScale after setting a new Y axis grouping +/- sort order
    // For a first draw, specify `firstDraw` = true to avoid an animated transition.
    $timeline.unbind("reorderY").on("reorderY", function(e, firstDraw) {
      var duration = 0,
          prevHeight = parseInt10(d3.select("#timeline").attr("height")),
          height, sortKeys;
      
      if (!firstDraw) {
        sortKeys = _.extend({}, defaultSortKeys, draggedSortKeys);
        yGroups = setupYScaleAndGroups(erapIdDeptTuples, yScale, rowHeight, padGroups, sortKeys);
        duration = 500;
      }
      height = _.last(yScale.range()) + rowHeight;
      d3.select("#timeline").attr("height", Math.max(height + xAxisSize, prevHeight));
      xAxis.tickSize(-height, 0);
      
      // These classes change the behavior/styling of the whole timeline based on the Y axis sort order
      timelineSvg.classed("single-groups", yGroups.grouping.length === 1)
          .classed("grouping-by-pt", yGroups.grouping[0] === 0);
      
      // Bind data for the Y axis labels--the left column of labels on the right edge of the timeline
      var yAxisLabels = timelineSvg.select(".y.axis")
        .selectAll("text")
          .data(yScale.domain());
      yAxisLabels.exit().remove();
      
      yAxisLabels.enter().append("text")
          .attr("class", "dept-label")
          .attr("dy", rowHeight - 1);
      
      // Bind data for the row dividers (the alternating stripes that delineate vertical groups)
      var yDividerTop = function(yGroup) { 
        if (!_.isUndefined(draggingRow[yGroup.label])) { return draggingRow[yGroup.label]; }
        return yScale(yGroup.start) - (padGroups ? 0.5 : 0) * rowHeight; 
      }
      var yDividerCenter = function(yGroup) { 
        var yTop = yScale(yGroup.start) + padRowTop;
        if (!_.isUndefined(draggingRow[yGroup.label])) { yTop = draggingRow[yGroup.label]; }
        return yTop + rowHeight * (yGroup.length * 0.5);
      }
      var rowDividersGG = rowDividersG.selectAll("g").data(yGroups, function(grp) { return grp.label; });
      rowDividersGG.exit().remove();
      
      var rowDividersGEnter = rowDividersGG.enter().append("g");
      rowDividersGEnter.append("rect")
          .attr("x", 0);
      rowDividersGEnter.append("text")
          .attr("text-anchor", "end")
          .attr("dy", rowHeight * 0.5);
          
      // This callback does all the actual work of repositioning rows and data along the Y axis
      // It is called immediately, and also during drag operations--in which case, provide a `draggingEl`.
      var redrawRows = function(rowDividers, duration, draggingEl) {
        var draggingYGroup = draggingEl ? d3.select(draggingEl).data()[0] : {label: null},
            durationDragMask = function(d) {
              return draggingEl && draggingYGroup.label == yGroups.selector(d)[0] ? 0 : duration;
            },
            deltaY = function(d) {
              if (_.isArray(d)) { d = yGroups.selector(d)[0]; }
              if (draggingEl && !_.isUndefined(draggingRow[d])) { 
                return draggingRow[d] - yScale(draggingYGroup.start) - padRowTop;
              }
              return 0;
            };
        
        // Reposition the row dividers
        rowDividers.select("rect").transition()
            .duration(function() { return this.parentNode == draggingEl ? 0 : duration; })
            .attr("y", yDividerTop)
            .attr("height", function (yGroup) { return rowHeight * yGroup.length; });
        rowDividers.select("text").transition()
            .duration(function() { return this.parentNode == draggingEl ? 0 : duration; })
            .attr("y", yDividerCenter)
            .text(function(yGroup) { return yGroup.label });
        rowDividers.sort(function(a, b){ return yDividerCenter(a) - yDividerCenter(b); })
            .classed("even-child", function(yGrp, i) { return i % 2 == 1; })
        if (draggingEl) { d3.select(draggingEl).moveToFront(); }
        
        // Y axis labels
        yAxisLabels.transition()
            .duration(function(v) { return draggingEl && _.first(v) === draggingYGroup.label ? 0 : duration; })
            .attr("y", function(v) { return yScale(v) + deltaY(_.first(v)); })
            .text(function(v) { return _.last(v); });
        
        // Encounters (horizontal bars) and isolates (points) and isolate tests (points)
        plotAreaG.select(".encounters").selectAll("rect").transition()
            .duration(function(enc) { return durationDragMask([enc.eRAP_ID, enc.department_name]); })
            .attr("y", function(enc) {
              return yScaleGrouped([enc.eRAP_ID, enc.department_name]) + deltaY([enc.eRAP_ID, enc.department_name]); 
            });
        plotAreaG.select(".isolate-tests").selectAll("path").transition()
            .duration(function(test) { return durationDragMask([test.eRAP_ID, test.imputed_unit]); })
            .attr("transform", function(test) { 
              var shiftedY = isolateTestY(test) + deltaY([test.eRAP_ID, test.imputed_unit]);
              return 'translate(' + isolateTestX(test) + ',' + shiftedY + ')'; 
            });
        plotAreaG.select(".isolates").selectAll("path").transition()
            .duration(function(iso) { return durationDragMask([iso.eRAP_ID, iso.collection_unit]); })
            .attr("transform", function(iso) { 
              var shiftedY = isolateY(iso) + deltaY([iso.eRAP_ID, iso.collection_unit]);
              return 'translate(' + isolateX(iso) + ',' + shiftedY + ')'; 
            });
        
        // Reposition transfers and overlaps; note they are hidden (via CSS opacity) during dragging
        plotAreaG.select(".transfers").selectAll("line").transition()
            .duration(draggingEl ? 0 : duration)
            .attr("y1", function(enc) { 
              var depts = [enc.department_name, enc.transfer_to];
              return _.min(_.map(depts, function(dept) { return yScaleGrouped([enc.eRAP_ID, dept]); }));
            })
            .attr("y2", function(enc) {
              var depts = [enc.department_name, enc.transfer_to];
              return _.max(_.map(depts, function(dept) { return yScaleGrouped([enc.eRAP_ID, dept]); }))
                  + rowHeight;
            });
        plotAreaG.select(".overlaps").transition()
            .duration(draggingEl ? 0 : duration * 0.2)
            .attr("opacity", 0)
            .transition().delay(draggingEl ? 0 : duration * 0.8).duration(draggingEl ? 0 : duration * 0.2)
            .attr("opacity", 1);
        plotAreaG.select(".overlaps").selectAll("path").transition()
            .duration(0).delay(draggingEl ? 0 : duration * 0.5)
            .attr("d", function(ov) { return overlapPath(ov, xScale, yScaleGrouped, rowHeight, overlapBend); })
      }
      updateRowDragInteractions(rowDividersGG, yDividerTop, yDividerCenter, redrawRows, height);
      redrawRows(rowDividersGG, duration);
      
      // Finally, resize the <rect> that receives all zoom interactions, and the plot clipping path
      zoomRect.attr("height", height);
      d3.select("#timeline-clip").select("rect").transition().duration(duration)
          .attr("height", height);
    });
    
    // Bind event handler to resize the timeline after resizing the browser window
    $timeline.unbind("resizeWidth").on("resizeWidth", function(e, reorderingY) {
      resizeTimelineWidth(paddingLeft, xScale, zoom);
      $timeline.trigger("zoomX", reorderingY);
    });
    
    // Bind event handler for updating isolate symbols when clicking them
    $timeline.unbind("updateSymbols").on("updateSymbols", function(e) {
      timelineSvg.select(".isolates").selectAll("path")
          .attr("d", isolateSymbolPath);
    });

    // Finally, trigger a reordering/resize to kick off an initial draw of the timeline
    $timeline.trigger("reorderY", true);
    $timeline.trigger("resizeWidth");
    fadeOutSpinnerDebounced();

  } // /end updateTimeLine()
  
  // If there are more than three patients, initially collapse the timeline vertically to save space
  $yGrouping.val(_.pluck(isolates, 'eRAP_ID').length > 3 ? "0" : "0,1");
  updateTimeline();
  
  // ====================================================================
  // = Setup callbacks for major controls that update the visualization =
  // ====================================================================
  
  // Note, with regard to showing the $LOADING_SPINNER. In general, any UI refresh that ends up
  // calling tree.update() or updateTimeline() should show it, as both of these functions are
  // expensive and freeze the UI during the redraw.
  // Other changes, e.g., only triggering CSS styles via classes, may not need a loading spinner.
  
  // The following helper 
  
  function showSpinner(andHideSpinnerAfter, during) {
    if ($LOADING_SPINNER.stop().is(':hidden')) {
      $LOADING_SPINNER.fadeIn(function() { 
        during();
        if (!!andHideSpinnerAfter) { fadeOutSpinnerDebounced(); }
      });
    } else {
      during();
      if (!!andHideSpinnerAfter) { fadeOutSpinnerDebounced(); }
    }
  }
  
  // Setup the rangeslider for spatiotemporal overlap tolerance
  $tolerance.attr({min: 0, max: TOLERANCE_STEPS.length - 1, value: TOLERANCE_DEFAULT}).rangeslider({ 
    polyfill: false,
    onSlide: function(pos, value) { 
      $LOADING_SPINNER.show();
      $toleranceNum.val(TOLERANCE_STEPS[value]);
      $toleranceUnits.text(TOLERANCE_UNITS[value]); 
    },
    onSlideEnd: function(pos, value) { $toleranceNum.change(); }
  });
  $tolerance.on('change', function() { $toleranceNum.change(); });
  $toleranceNum.on('change', updateTimeline);
  
  $colorBy.change(function() {
    showSpinner(false, function() {
      tree.update();
      updateColorLegend(tree);
      updateTimeline();
    });
  });
  
  $variantLabels.change(updateVariantLabels);
  $variantNtOrAa.change(function() {
    showSpinner(true, function() {
      updateVariantLabels();
      tree.update();
    });
  });
  
  $filter.change(function() {
    showSpinner(false, function() { updateTimeline(); });
  });
  
  $isolateTests.change(function() {
    var classes = $(this).find('option').map(function() { return $(this).val(); }).get();
    $timeline.removeClass(classes.join(' '));
    $timeline.addClass($(this).val());
  });
  
  $yGrouping.change(function() {
    $timeline.trigger("reorderY", false);
    $timeline.trigger("resizeWidth", true);
  });
  
  $showOverlaps.click(function() {
    $showOverlaps.toggleClass("active");
    $showOverlaps.trigger("change");
  });
  $showOverlaps.on("change", function() {
    $timeline.toggleClass("hide-overlaps", !$showOverlaps.hasClass("active"));
  });
  queryParamSpec.showOverlaps = function(val) {
    if (!_.isUndefined(val) && !_.isNull(val)) { 
      $showOverlaps.toggleClass("active", val == "1").trigger("change"); 
    }
    return $showOverlaps.hasClass("active") ? "1" : "0";
  }
  
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
  
  // =======================================================
  // = Finally, sync URL parameters to all of the controls =
  // =======================================================
  
  syncQueryParamsToDOM(queryParamSpec);
  
  _.each(queryParamSpec, function(getterSetter, paramName){
    if (getterSetter === false || getterSetter === null) { return; }
    $('#' + camelCaseToDashed(paramName)).change(function() {
      syncDOMToQueryParamsDebounced(queryParamSpec);
    });
  });
}