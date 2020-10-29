/********************************************
 ** The following code adds tutorials to the heatmap and dendro-timeline visualizations **
 ********************************************/

// Cookie functions, so we can figure out if the user has ever seen these pages before
// If not, we can be more aggressive about suggesting a tutorial

function cookieExists(cookieName) {
  return _.any(document.cookie.split(';'), function(v) { return v.trim().indexOf(cookieName + '=') == 0; });
}

function setCookieTrueForever(cookieName) {
  document.cookie = cookieName + "=true; expires=Fri, 31 Dec 9999 23:59:59 GMT";
}

function doOnlyOnceUsingCookies(key, fn) {
  var cookieName = key.replace(/[^a-zA-Z0-9!#$%&'*+.^_`|~-]/g, '_');
  if (!cookieExists(cookieName)) { setCookieTrueForever(cookieName); _.isFunction(fn) && fn(key); }
}

function suggestTutorialWithD3Tip(d3Tip, viewName) {
  var tipHtml = '<div class="first-time"><p><strong>Welcome to PathoSPOT\'s "' + viewName + '" view!</strong></p>' +
      '<p>Click above for an introduction to the controls and subviews.</p></div>';
  d3Tip.show({html: tipHtml, tipDir: "s", tipOffset: [15, 10]}, $('.tutorial-btn svg').get(0));
  $('.d3-tip').addClass('d3-tip-bouncein-up');
  
  function d3TipHide() { d3Tip.hide(); }
  function d3TipFadeout() { $('.d3-tip').has('.first-time').length && $('.d3-tip').fadeOut(500, d3TipHide); }
  
  $(window).on('click.suggestTut scroll.suggestTut', function() { d3TipHide(); $('body').off('.suggestTut'); });
  window.setTimeout(d3TipFadeout, 5000);
}

// Generates captions for the `heatmap` visualization, depending on the current state of the interface

function writeHeatmapIntroJsCaptions() {
  var currentFilters = getFilters('#filter');
  
  var sliderBeeswarmIntroHtml = '<p>This is a timeline of the genomes selected for display.</p>' +
      '<ul><li>Each <strong>filled</strong> circle is a genome linked to at least one other isolate ' +
      'from a different patient, thereby suggesting a transmission or outbreak. </li>' +
      '<li>Each <strong>open</strong> circle is a genome that is not linked to other patients.</li></ul>' +
      '<p>They are laid out horizontally according to the time of collection.</p>' +
      '<p>You can further filter genomes by the time of collection using the dark gray sliders. <em>Try it now!</em></p>';
  
  if (currentFilters.clustersOnly) {
    sliderBeeswarmIntroHtml += '<p><em>Only putative transmissions</em>, i.e. filled circles, are ' +
        ' currently being displayed. Next, we will see how to show the rest of the genomes.</p>'
  }
  
  $('g.sliderBeeswarm').attr({"data-intro": sliderBeeswarmIntroHtml, "data-step": 1, "data-scrollTo": "tooltip"});
  
  var filtersIntroHtml = '<p>Genomes can be merged and filtered for display here.</p>';

  if (currentFilters.mergeSamePt) {
    filtersIntroHtml += '<p>Currently, similar genomes from the same patient are merged. ';
  } else {
    filtersIntroHtml += '<p>You can merge similar genomes from the same patient by selecting the first option. ';
  }
  filtersIntroHtml += 'This simplifies the view so that only putative transmissions <em>between</em> patients '+
      ' show up as colored clusters.</p>';
      
  if (currentFilters.clustersOnly) {
    filtersIntroHtml += '<p>Currently, only putative transmissions are being displayed. ' +
        'Unselect this option to show the many genomes that are <em>not</em> part of an outbreak cluster.</p>';
  } else {
    filtersIntroHtml += '<p>You can also focus the visualization on <em>only</em> genomes involved in putative ' +
        'transmissions (hiding the rest) by activating the second option.</p>';
  }
  
  $('#filter-cont').attr({"data-intro": filtersIntroHtml, "data-step": 2, "data-offsetAdjustHeight": 300, "data-scrollTo": "tooltip"});
  
  var snpsIntroHtml = '<p>This slider sets the threshold of single nucleotide polymorphisms (SNPs) below which genomes ' +
      ' are considered <em>similar</em> and thereby linked into a cluster.</p>' +
      '<p>Suitable SNP thresholds for identifying potential transmission events depend on the organism that is ' +
      'being studied, its mutation rate, the sequencing error rate, and the diversity among isolates in the dataset.</p>' +
      '<p>Next, we\'ll see one way to pick a useful threshold.</p>';
  
  $('#snps-cont').attr({"data-intro": snpsIntroHtml, "data-step": 3});
  
  var histoIntroHtml = '<p>The histogram depicts distributions of pairwise SNP distances among:</p><ul>' +
      '<li>same-patient isolates, expected to be related: <span class="black-bars">black bars</span></li>' +
      '<li>different-patient isolates, which are not, assuming a low level of transmission: ' +
      '<span class="gray-bars">gray bars</span></li></ul>' +
      '<p>A SNP threshold (<span class="red-dashed">red dashed</span> line) can be selected empirically by attempting ' +
      'to separate these two distributions.</p>' +
      '<p>You can click the histogram to move the threshold. <em>Try it now!</em></p>' +
      '<p>Observe how this affects the clusters listed above and the main viz below. A lower ' +
      'threshold results in fewer, smaller clusters (↑ specificity, ↓ sensitivity).</p>';

  $('g.histo').attr({"data-intro": histoIntroHtml, "data-step": 4});
  
  var clusterLegendHtml = '<p>These are the clusters that were detected at the current similarity threshold and ' +
      'merging/prefiltering settings.</p>' +
      '<p>Each cluster is assigned an arbitrary color. The overlaid numbers show how many genomes are in each cluster.</p>' +
      '<p>Click on the clusters to open a timeline view of the genomes within. You can also download the cluster ' +
      'assignment using the "TSV" link.</p>';

  $('#cluster-legend').attr({"data-intro": clusterLegendHtml, "data-step": 5});
  
  if ($('.main-view.heatmap').data('active')) {
    var mainHeatmapHtml = '<p>This is a heatmap of pairwise distances (in parsnp SNPs) between genomes using ' +
        'the merging, filtering, and time constraints set above.</p>' +
        '<p>Distances under the SNP threshold are shaded in the color of the corresponding cluster, and generally fall ' +
        'along the diagonal.</p>';

    if ($('g.main-view').hasClass('hide-axis-labels')) { 
      mainHeatmapHtml += '<p>At right, a dendrogram connects isolates within 100 parsnp SNPs. Too many isolates are ' +
          'currently being shown, but if additional filtering was performed, metadata for each isolate would be listed ' +
          'to the right of the heatmap.</p>';
    } else {
      mainHeatmapHtml += '<p>At right, metadata for each isolate is listed, and a dendrogram connects isolates within ' +
          '100 parsnp SNPs. If too many isolates are shown to print the metadata, it is hidden.</p>';
    }
    
    $('g.main-view.heatmap').attr({"data-intro": mainHeatmapHtml, "data-step": 6, "data-scrollTo": "tooltip"});
    $('g.main-view.network').removeAttr("data-intro");
  } else {
    var mainNetworkHtml = '<p>This is a network layout view of the spatial relationships between genomes, organized ' +
        'by the location of collection (hospital and ward).</p>' +
        '<p>Nodes are colored by cluster; ward types are grouped together in this map, although the position of each ' +
        'ward within is anonymized (arbitrary).</p>' +
        '<p>Genomic links under the threshold are red lines. The density plot underneath depicts collected isolates ' +
        '(including unsequenced ones), which highlights heavily sampled locations.</p>';
    
    $('g.main-view.network').attr({"data-intro": mainNetworkHtml, "data-step": 6, "data-scrollTo": "tooltip",
          "data-highlightClass": "introjs-transparent-helper"})
    $('g.main-view.heatmap').removeAttr("data-intro");
  }
  
  var animateHtml = '<p>These buttons control an animation of the time range of isolates displayed.</p>' +
      '<p>The first two play buttons move a sliding window from the past to the future, while the latter ' +
      'two steadily expand the endpoint of the time range. <em>Try it now!</em></p>';
  
  $('#daterange-animate').attr({"data-intro": animateHtml, "data-step": 7});
  
  var toggleViewHtml = '<p>Finally, this toggles between the heatmap and the network map view. <em>Try it now!</em></p>' +
      '<p>This concludes the tutorial. <strong>Happy outbreak hunting!</strong> Click "Done" below to exit.</p>';

  $('#toggle-main').attr({"data-intro": toggleViewHtml, "data-step": 8});
}

function heatmapIntroJs(d3Tip) {
  writeHeatmapIntroJsCaptions();
  
  var viewName = $('.main-view.heatmap').data('active') ? 'heatmap' : 'network map';
  var intro = introJs().setOptions({skipLabel: "Exit"}).onbeforechange(function(targetElement) {
    if (targetElement.id == 'filter-cont') {
      $(targetElement).find('.select2-selection__arrow').click();
      $('.select2-dropdown').addClass('select2-popover-introjs');
    } else {
      $('.select2-dropdown').removeClass('select2-popover-introjs');
    }
  });
  
  $('.tutorial-btn').click(function() { writeHeatmapIntroJsCaptions(); intro.start(); });
  
  $('.tutorial-btn').length && doOnlyOnceUsingCookies(viewName, function(viewName) {
    suggestTutorialWithD3Tip(d3Tip, viewName);
  });
}


// Generates captions for the `dendro-timeline` visualization

function writeDendroTimelineIntroJsCaptions() {
  var dendroIntroHtml = '<p>This is a dendrogram of the phylogenomic relationships among isolates selected for display.</p>' +
      '<p>Horizontal distances are scaled to SNPs per Mbp of core genome (see the scale bar at top).</p>' +
      '<p>By default, the tree is rooted to the chronologically first genome, according to collection time.</p>';

  $('#dendro-dummy').attr({"data-intro": dendroIntroHtml, "data-step": 1, "data-scrollTo": "tooltip"});
  
  var colorByHtml = '<p>This changes the color scheme for the isolates in all of the visualizations on this page.</p>' +
      '<p>You can shade them either by collection time or collection location. <em>Try it now!</em></p>' +
      '<p>Changes are immediately reflected in the color legend to the left.</p>';
  
  $('#color-nodes-cont').attr({"data-intro": colorByHtml, "data-step": 2})
  
  var variantMapHtml = '<p>The exact SNPs differentiating these isolates in the core genome alignment, and their ' +
      'corresponding locations in the reference genome, are shown here.</p>' +
      '<p>Note that our analysis pipeline currently picks the reference genomes randomly (without regard to chronology or the quality ' +
      'of assembly/annotation).</p>' +
      '<p>SNPs are shaded as follows:</p><ul>' +
      '<li><span class="ref-allele">Reference allele</span></li>' +
      '<li><span class="syn">Synonomyous substitution (or non-coding region)</span></li>' +
      '<li><span class="nonsyn">Non-synonymous substitution</span></li></ul>';

  $('#variant-map-dummy').attr({"data-intro": variantMapHtml, "data-step": 3});
  
  var variantLabelsHtml = '<p>If your reference genome was annotated with predicted genes, you can label the variant map ' +
      'columns with the gene names or descriptions; other options are showing genomic coordinates or hiding the labels.</p>' +
      '<p>You can also toggle between displaying nucleotide-level changes or predicted amino acid changes (within coding regions). ' +
      '<em>Try it now!</em></p>';

  $('#variant-labels-cont').attr({"data-intro": variantLabelsHtml, "data-step": 4, "data-position": "left"});
  
  var timelineIntroHtml = '<p>This is a timeline of patient movements with genomes/isolates overplotted as filled circles.</p>' +
      '<p>Colors are the same as for the dendrogram.</p>' +
      '<p>You can hover over elements to see more details in a tooltip. You can also pan and zoom with your mouse and mousewheel ' +
      '(or two-finger scroll). <em>Try it now!</em></p>' +
      '<p>Light red arcs show <strong>overlaps</strong> in location between different patients, within the threshold set by ' +
      'the slider, e.g. a patient leaving a unit X hours before the next one arrives would still count as an overlap.</p>';
  
  $('#timeline').attr({"data-intro": timelineIntroHtml, "data-step": 5, "data-scrollTo": "tooltip"});
  
  var filtersContIntroHtml = '<p>Using <em>Filter events</em>, you can filter location data plotted in these timelines, e.g., inpatient ' +
      'vs. outpatient events.</p>' +
      '<p>If available, you can use <em>Filter culture results</em> to plot data for <strong>unsequenced</strong> culture testing as ' +
      'X\'s and unfilled circles (for negatives and positives, respectively).</p>';
  
  $('#filters-cont').attr({"data-intro": filtersContIntroHtml, "data-step": 6});
  
  var timelineGroupingHoverHtml = '<p>The vertical layout of the timeline rows, including nested grouping that will provide ' +
      'a "piano roll" view of locations per patient or vice versa, can be altered here. <em>Try it now!</em></p>' +
      '<p>You can also change how events in the timeline are highlighted when hovering with the mouse.</p>';  
  
  $('#timeline-grouping-hover-cont').attr({"data-intro": timelineGroupingHoverHtml, "data-step": 7});
  
  var dendroIsolateHtml = '<p>Finally, you can correlate particular sequenced isolates across the timeline and dendrogram by changing ' +
      'the symbol.</p>' +
      '<p>To do this, click the nodes in either visualization, and they will switch to a new symbol (more clicks will cycle through the ' +
      'symbols). <em>Try it now!</em></p>' +
      '<p>You can alt- or option-click to reset it to the default of a small filled circle.</p>';
  
  $('#dendro-sample-node-dummy').attr({"data-intro": dendroIsolateHtml, "data-step": 8});
  
  var dendroIsolateHtml = '<p>Typically you arrive here by exploring clusters created in the heatmap view, which selects the isolates ' +
      'that are loaded into this visualization.</p>' +
      '<p>However, if you want to manually add or remove isolates from this view, use this button.</p>' +
      '<p>This concludes the tutorial. <strong>Happy outbreak exploring!</strong> Click "Done" below to exit.</p>';

  $('#add-remove-isolates-cont').attr({"data-intro": dendroIsolateHtml, "data-step": 9});
}

function dendroTimelineIntroJs(d3Tip) {
  writeDendroTimelineIntroJsCaptions(); 
  
  var intro = introJs().setOptions({skipLabel: "Exit"}).onbeforechange(function(targetElement) {
    if ($(targetElement).data('dummyFor') == 'dendro') {
      $('#dendro').addClass('dendro-popover-introjs');
    } else {
      $('#dendro').removeClass('dendro-popover-introjs');
    }
  })
  
  $('.tutorial-btn').click(function() { writeDendroTimelineIntroJsCaptions(); intro.start(); });
  
  $('.tutorial-btn').length && doOnlyOnceUsingCookies("dendro-timeline", function(viewName) {
    suggestTutorialWithD3Tip(d3Tip, viewName);
  });
}