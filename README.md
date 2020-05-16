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
    - `.snv.heatmap.json` -> produced by [pathoSPOT-compare][]'s `heatmap` task
    - `.parsnp.heatmap.json` -> produced by [pathoSPOT-compare][] `parsnp` task
    - `.parsnp.vcfs.npz` -> produced by [pathoSPOT-compare][] `parsnp` task
    - `.encounters.tsv` -> produced by [pathoSPOT-compare][] `encounters` task
    - `.epi.heatmap.json` -> produced by [pathoSPOT-compare][] `epi` task
3. Access `heatmap.php` via a web browser.

[pathoSPOT-compare]: https://github.com/powerpak/pathospot-compare

### Optional configuration

1. Copy `php/example.include.php` to `php/include.php` and edit the stubs to include extra HTML, CSS, or JS in the visualizations. This could be used to theme the pages or integrate them into another website.
    - Important: ensure `$PYTHON` is set to your preferred Python interpreter.
2. Copy `js/example.config.js` to `js/config.js` and edit the variables there to change link destinations and other properties of the visualizations.

## Visualizations

An `index.php` is included which by default shows the splash page from the [PathoSPOT website][pathospot], but you could replace this with whatever you like. Alternatively, you can link directly to various visualizations from your own website or internal dashboard using the URL parameters detailed below.

### heatmap.php

Visualizes the output of [pathoSPOT-compare][]'s `parsnp`, `heatmap`, and `epi` tasks.

TODO: document further here.

### dendro-timeline.php

TODO: document further here.