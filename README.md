# PathogenDB visualization

## Requirements

Apache, PHP, and Python. Could be readily hosted in a [Minerva](http://hpc.mssm.edu/) www directory.

Python is required for running the contents of `scripts/`, which some of the PHP pages will need to do for each page request. They require two 3rd party modules: NumPy and ete3.

## Usage

1. Clone this repository into a web-accessible directory.
2. Supply analysis output from [pathogendb-comparison][] by placing it in `data/`. All the output files read by this package include a YYYY-MM-DD formatted date in the filename and have one of the following endings:
    - `.snv.heatmap.json` -> produced by [pathogendb-comparison][]'s `heatmap` task
    - `.parsnp.heatmap.json` -> produced by [pathogendb-comparison][] `parsnp` task
    - `.parsnp.vcfs.npz` -> produced by [pathogendb-comparison][] `parsnp` task
    - `.encounters.tsv` -> produced by [pathogendb-comparison][] `encounters` task
    - `.epi.heatmap.json` -> produced by [pathogendb-comparison][] `epi` task
3. Access `heatmap.php` via a web browser.

[pathogendb-comparison]: https://github.com/powerpak/pathogendb-comparison

### Optional configuration

1. Copy `php/example.include.php` to `php/include.php` and edit the stubs to include extra HTML, CSS, or JS in the visualizations. This could be used to theme the pages or integrate them into another website.
    - Important: ensure `$PYTHON` is set to your preferred Python interpreter.
2. Copy `js/example.config.js` to `js/config.js` and edit the variables there to change link destinations and other properties of the visualizations.

## Visualizations

### heatmap

Visualizes the output of [pathogendb-comparison][]'s `parsnp`, `heatmap`, and `epi` tasks.

TODO: document further here.

### dendro-timeline

TODO: document further here.