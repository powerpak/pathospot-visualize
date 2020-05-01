#!/usr/bin/env bash
# Intended to be run as root by Vagrant when provisioning a vanilla Debian Stretch box
# (although it could be modified by an advanced user for other scenarios)
# Optionally, provide the VM's login username as the 1st argument (default is "vagrant")

# This detects the home directory for the default user (uid 1000), which is given a 
# different name on different vagrant providers (e.g. admin, vagrant)
DEFAULT_UID="1000"
DEFAULT_HOME="$(getent passwd $DEFAULT_UID | cut -d: -f6)"

apt-get update
apt-get install -y apache2
apt-get install -y php7.0 libapache2-mod-php7.0
apt-get install -y python-pip python-dev

# Fetch all the python modules required by the python scripts
pip install -r requirements.txt