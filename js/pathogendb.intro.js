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
  window.setTimeout(d3TipFadeout, 3000);
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
  
  var intro = introJs().onbeforechange(function(targetElement) {
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
  var dendroIntroHtml = '<p>This is a timeline of the genomes selected for display.</p>' +
      '<ul><li>Each <strong>filled</strong> circle is a genome linked to at least one other isolate ' +
      'from a different patient, thereby suggesting a transmission or outbreak. </li>' +
      '<li>Each <strong>open</strong> circle is a genome that is not linked to other patients.</li></ul>' +
      '<p>They are laid out horizontally according to the time of collection.</p>' +
      '<p>You can further filter genomes by the time of collection using the dark gray sliders. <em>Try it now!</em></p>';

  $('g.phylotree-container').attr({"data-intro": dendroIntroHtml, "data-step": 1, "data-scrollTo": "tooltip"});
}

function dendroTimelineIntroJs(d3Tip) {
  //writeDendroTimelineIntroJsCaptions(); introJs().start();
}