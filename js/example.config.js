/******************************************************************

  Configurable options for the visualizations

  Copy to config.js and edit there (this is only an example)

******************************************************************/

// When displaying these data fields, automatically link them to the following URLs

var LINKABLE_FIELDS = {
  eRAP_ID: 'https://erap.mssm.edu/Clinical/donor.asp?donor_id=%s',
  isolate_ID: 'https://pathogendb.mssm.edu/tIsolates.php?PME_sys_operation=PME_op_View&PME_sys_rec=%s',
  assembly_ID: 'http://smrtportal.hpc.mssm.edu:8080/smrtportal/#/View-Data/Details-of-Job/%s'
};

// When linking to genomes/assemblies in IGB Quickload format, use this base directory

var IGB_DIR = 'https://vanbah01.u.hpc.mssm.edu/igb/'

// When linking to .snv.bed files, use this base directory

var TRACKS_DIR = 'https://pakt01.u.hpc.mssm.edu/comparison-tracks/'

// What URL for ChromoZoom to use when linking to genome browser views of IGB Quickload genomes

var CHROMOZOOM_URL = 'https://pakt01.u.hpc.mssm.edu/chromozoom/?db=igb:100:%s&tracks=ruler:25|total_reads:50|Annotation:100'

// What map to use for the network diagram. These are stored in the maps/ directory as a .json and .png.

var HOSPITAL_MAP = 'anon-hospital-gray';