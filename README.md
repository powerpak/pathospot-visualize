# pathoSPOT-visualize

This web interface is used to explore phylogenomic evidence of outbreaks and is the visualization component of PathoSPOT, the **Patho**gen **S**equencing **P**hylogenomic **O**utbreak **T**oolkit.

The [pathoSPOT-compare][] pipeline must first be used to run the analyses that supply this web interface. Typically, you will want to run the **parsnp**, **encounters**, and **epi** tasks.  Please refer to the [pathoSPOT-compare documentation][pathoSPOT-compare] to get started.

## Requirements

Apache, PHP, and Python. Could be readily hosted in a [Minerva](http://hpc.mssm.edu/) www directory.

Python is required for running the contents of `scripts/`, which some of the PHP pages will need to do for each page request. They require two 3rd party modules: NumPy and ete3.

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

### heatmap

Visualizes the output of [pathoSPOT-compare][]'s `parsnp`, `heatmap`, and `epi` tasks.

TODO: document further here.

### dendro-timeline

TODO: document further here.