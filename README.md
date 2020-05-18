# pathoSPOT-visualize

This web interface is used to explore phylogenomic evidence of outbreaks and is the visualization component of PathoSPOT, the **Patho**gen **S**equencing **P**hylogenomic **O**utbreak **T**oolkit.

For a live demo, please see the [PathoSPOT website][pathospot].

<p align="center"><a href="https://pathospot.org"><img src="https://pathospot.org/images/pathospot-logo.svg" width="640px"/></a></p>

The [pathoSPOT-compare][] pipeline must first be used to run the analyses that supply this web interface. Typically, you will want to run the **parsnp**, **encounters**, and **epi** tasks.  Please refer to the [pathoSPOT-compare documentation][pathoSPOT-compare] to get started.

If you use this software, please cite our preprint:

> Berbel Caban A, Pak TR, Obla A et al. 2020. [PathoSPOT genomic surveillance reveals under the radar outbreaks of methicillin resistant S. aureus bloodstream infections][preprint]. _medRxiv_ (preprint). doi:10.1101/2020.05.11.20098103

[pathospot]: https://pathospot.org
[preprint]: https://www.medrxiv.org/content/10.1101/2020.05.11.20098103v1

## Requirements

Apache, PHP, and Python. Could be readily hosted in a [Minerva](https://labs.icahn.mssm.edu/minervalab/) www directory.

Python is required for running the contents of `scripts/`, which some of the PHP pages will need to do for each page request. They require two 3rd party modules: NumPy and ete3.

If you use Vagrant to create an environment for [pathoSPOT-compare][], this software and its requirements are automatically included as well, and Apache will automatically serve the website on port 80. However, there is no requirement to have the pipeline and this web interface on the same machine. They were designed so that the output files (listed below) could be easily moved to be served from a more convenient location, e.g. your lab's webserver, an Amazon EC2 instance, etc.

## Usage

1. Clone this repository into a web-accessible directory.
2. Supply analysis outputted from [pathoSPOT-compare][] by placing it in `data/`. All the output files read by this package include a YYYY-MM-DD formatted date in the filename and have one of the following endings:
    - `.parsnp.heatmap.json` → produced by [pathoSPOT-compare][] `parsnp` task
    - `.parsnp.vcfs.npz` → produced by [pathoSPOT-compare][] `parsnp` task
    - `.encounters.tsv` → produced by [pathoSPOT-compare][] `encounters` task
    - `.epi.heatmap.json` → produced by [pathoSPOT-compare][] `epi` task
3. Access `heatmap.php` via a web browser.

[pathoSPOT-compare]: https://github.com/powerpak/pathospot-compare

### Optional configuration

1. Copy `php/example.include.php` to `php/include.php` and edit the stubs to include extra HTML, CSS, or JS in the visualizations. This could be used to theme the pages or integrate them into another website.
    - Important: ensure `$PYTHON` is set to your preferred Python interpreter.
2. Copy `js/example.config.js` to `js/config.js` and edit the variables there to change link destinations and other properties of the visualizations.

## Visualizations

An `index.php` is included which by default shows the splash page from the [PathoSPOT website][pathospot], but you could replace this with whatever you like. Alternatively, you can link directly to various visualizations from your own website or internal dashboard using the URL parameters detailed below.

### heatmap.php

This visualization allows you to interactively create and explore clusters of genomes suspicious for transmission. _Click the screenshot for an interactive demo._

<a href="https://pathospot.org/heatmap.php?db=outbreak_MRSA-orange_deID.2019-10-20.parsnp&filter=clustersOnly&snps=15&range=0.0|1.0"><img src="https://pathospot.org/images/screenshot-heatmap.png" width="600px"/></a>

The main area is a clustered heatmap of pairwise genome-to-genome distances. Any pairs falling underneath the *similarity threshold* (controlled by the slider at top right) light up as colored blocks along the diagonal. Colors are arbitrarily assigned (a color legend is created next to *8 clusters detected*), and these delineate clusters suspicious for transmission at your chosen threshold.

<img src="https://pathospot.org/images/screenshot-histo.png" width="300px"/>

To help empirically choose a threshold, a histogram of distances is provided above and to the right of the heatmap. These distances are separated into two categories: the lowest distance from each genome to *any* prior sampled genome (light gray bars) vs the lowest distance to prior genomes from the *same patient* (black bars). The black bars represent genomes you expect to be clonal, as they are from the same colonization or infection (small distances), while the light gray bars will include the normal variation of genomes seen in the wider population. The latter is typically a bimodal distribution with the left peak covered by the black bars. A cutoff would typically be chosen between these two peaks to best separate clonal and non-clonal distances.

### dendro-timeline.php

TODO: document further here.
