#!/usr/bin/env python
"""
prune-newick.py
Prunes the tree piped into STDIN to the minimal topology connecting only specific leaves.
Leaves to be kept are specified as command-line arguments, one for each leaf label.
The pruned tree is printed to STDOUT.

Uses ete3's TreeNode.prune() method. For more info on this method, see:
http://etetoolkit.org/docs/latest/tutorial/tutorial_trees.html#pruning-trees

USAGE: cat tree.nwk | python prune-newick.py leaf1 leaf2 leaf3 ...

"""

import sys
from ete3 import Tree

if len(sys.argv) < 2:
    sys.stderr.write(__doc__)
    sys.exit(1)

leaf_ids = sys.argv[1:]

try:
    t = Tree(sys.stdin.read(), format=0)
except:
    sys.stderr.write("Invalid Newick input provided to STDIN; could not parse tree.\nExiting.\n")
    sys.exit(3)

try:
    t.prune(leaf_ids)
except ValueError as e:
    sys.stderr.write("Some of the leaf labels could not be found in the input tree.\n")
    sys.stderr.write(e.message + "\nExiting.\n")
    sys.exit(2)

sys.stdout.write(t.write(format=0))
sys.stdout.flush()