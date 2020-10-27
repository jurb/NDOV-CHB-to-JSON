This script aims to

- download all files from https://data.ndovloket.nl/haltes/ periodically
- Of those files, rename the latest public transport information file (ExportCHB \*.xml.gz) to a 'Latest' version
- Unzip that file
- Convert the XML to JSON, using a few parser settings
- For now, filter on transport stops in Amsterdam

For more information, see the observable notebook at https://observablehq.com/@jurb/haltebestand-ndov-loket-xml-a11yjson

See https://github.com/BISONNL/CHB for the xsd of the xml.
