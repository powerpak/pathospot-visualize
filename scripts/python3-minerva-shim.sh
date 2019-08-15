#!/bin/bash

# This shim exists to bootstrap a python 3.4 interpreter within the Minerva environment
# that PHP can call out to with `proc_open()`.

# Because python3 can most easily be loaded with `module`, which is a bash function,
# we have to recreate the minimum module functionality here to load the python 3.4
# modulefiles inside a bash interpreter that then passess all arguments to python3.

export MODULEPATH=/hpc/packages/minerva-manda/modulefiles:/hpc/packages/minerva-common/modulefiles:/opt/mellanox/bupc/2.2/modules:/hpc/packages/minerva-mothra/modulefiles:/hpc/packages/minerva-mothra/modulefiles

function module () {
  eval `/usr/bin/modulecmd bash $*`
}

module unload python
module unload py_packages
module load python/3.4.0
module load py_packages/3.4

python3 $*
