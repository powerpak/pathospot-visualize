#!/usr/bin/env python
"""
This script is intended to extract portions of the .parsnp.vcfs.npz files created by the
`rake parsnp` task of pathogendb-comparison.

Those files contain NumPy arrays with data from the parsnp.vcf files created by parsnp, which
hold SNP alleles differentiating various strains. Storing them as NumPy arrays allows them
to be loaded and subsetted very quickly (no parsing needed).

USAGE: python vcfs-npz-to-json.py foo.parsnp.vcfs.npz tree_num assembly_1 assembly_2 ...

"""

import sys
import numpy as np
import re
import json

def to_serializable(obj):
    if isinstance(obj, np.generic):
        obj = obj.item()
    if isinstance(obj, bytes):
        return obj.decode("utf-8")
    return obj

def serializable_iterable(tup):
    return [to_serializable(x) for x in tup]

if len(sys.argv) <= 3 or not re.match(r'^\d+$', sys.argv[2]):
    sys.stderr.write(__doc__)
    sys.exit(1)

tree_num = int(sys.argv[2])
assembly_names = sys.argv[3:]
out_data = {"by_assembly": {}, "allele_info": [], "chrom_sizes": []}

try:
    npz = np.load(sys.argv[1])
except:
    sys.stderr.write("FATAL: Could not load .npz data from %s.\nExiting.\n" % sys.argv[1])
    sys.exit(2)

try:
    seq_list = npz["seq_list_%d" % tree_num]
    vcf_mat = npz["vcf_mat_%d" % tree_num]
    vcf_allele_info = npz["vcf_allele_info_%d" % tree_num]
    ref_chrom_sizes = npz["ref_chrom_sizes_%d" % tree_num]
except KeyError:
    sys.stderr.write("FATAL: Could not load data expected in the .npz file.\nExiting.\n")
    sys.exit(3)

# Find indices for the columns of the VCFs matching the assembly_names
seq_list = serializable_iterable(seq_list)
col_indices = np.array([seq in assembly_names for seq in seq_list])
col_indices = np.array(range(len(col_indices)))[col_indices]

if len(col_indices) != len(assembly_names):
    sys.stderr.write("FATAL: Could not find all assemblies in the .npz VCF matrix.\nExiting.\n")
    sys.exit(2)

# Find the rows of the VCF that are *not* all equal across those columns.
# The other alleles, being same across all assemblies, are not informative and therefore omitted.
row_indices = ~np.all(vcf_mat[col_indices[0], :] == vcf_mat[col_indices, :], axis=0)
vcf_mat_filt = vcf_mat[:, row_indices][col_indices, :]
allele_info_filt = vcf_allele_info[row_indices]

for i, col_index in enumerate(col_indices):
    out_data["by_assembly"][seq_list[col_index]] = serializable_iterable(vcf_mat_filt[i, :])

out_data["allele_info"] = list(map(serializable_iterable, allele_info_filt))
out_data["allele_info"].insert(0, list(allele_info_filt.dtype.names))

out_data["chrom_sizes"] = list(map(serializable_iterable, ref_chrom_sizes))
out_data["chrom_sizes"].insert(0, list(ref_chrom_sizes.dtype.names))

json.dump(out_data, sys.stdout)