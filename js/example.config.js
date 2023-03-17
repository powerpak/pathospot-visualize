/******************************************************************

  Configurable options for the visualizations

  Copy to config.js and edit there (this is only an example)

******************************************************************/

// When displaying these data fields, they can be automatically linked to a URL that shows more information
// Provide a URL that includes an '%s' placeholder, which will be replaced with the identifier
// If not specified, no links will be created.

var LINKABLE_FIELDS = {
  eRAP_ID: '',
  isolate_ID: '',
  assembly_ID: ''
};

// When linking to genomes/assemblies in IGB Quickload format, use this base directory

var IGB_DIR = '';

// When linking to .snv.bed files, use this base directory

var TRACKS_DIR = '';

// What URL for ChromoZoom to use when linking to genome browser views of IGB Quickload genomes

var CHROMOZOOM_URL = '';

// Maximum SNP distance threshold to allow in the heatmap view

var MAX_SNP_THRESHOLD = 100;

// What map to use for the network diagram. These are stored in the maps/ directory as a .json and .png.

var HOSPITAL_MAP = 'anon-hospital-gray';