const fs = require("fs");
// website-scraper downloads a page and files linked on that page
const scrape = require("website-scraper");
const SaveToExistingDirectoryPlugin = require("website-scraper-existing-directory");
// gunzips unzips files
const gunzip = require("gunzip-file");
// [xml2js](https://www.npmjs.com/package/xml2js) transforms XML to JSON
const xml2js = require("xml2js");

// This script aims to
// * download all files from https://data.ndovloket.nl/haltes/ periodically
// * Of those files, rename the latest public transport information file (ExportCHB *.xml.gz) to a 'Latest' version
// * Unzip that file
// * Convert the XML to JSON, using a few parser settings
// * For now, filter on transport stops in Amsterdam

// For more information, see the observable notebook at https://observablehq.com/@jurb/haltebestand-ndov-loket-xml-a11yjson
// See https://github.com/BISONNL/CHB for the xsd of the xml.

// We'd like to download the contents of the given URL, and keep only the lates version of the Export*.xml.gz file.
const scraperOptions = {
  urls: ["https://data.ndovloket.nl/haltes/"],
  urlFilter: function (url) {
    return url.indexOf("https://data.ndovloket.nl/haltes/") === 0;
  },
  directory: "scrapeNDOV",
  plugins: [new SaveToExistingDirectoryPlugin()],
  recursive: true,
  maxRecursiveDepth: 1,
};

// file name constants
const scrapeDir = "scrapeNDOV";
const ExportCHBLatestName = `ExportCHBLatest`;
const ExportCHBLatestZip = `${ExportCHBLatestName}.xml.gz`;
const ExportCHBLatestXML = `${ExportCHBLatestName}.xml`;

// function to get the newest (simple sorted) ExportCHB* filename
const getLatestCHBExport = () =>
  fs
    .readdirSync(scrapeDir)
    .filter((el) => el.slice(0, 9) === "ExportCHB")
    .sort()
    .slice(-1)[0];

// function to copy CHB file to root directory
const copyLatest = () =>
  fs.copyFile(
    `${scrapeDir}/${getLatestCHBExport()}`,
    ExportCHBLatestZip,
    (el) =>
      console.log(
        `${scrapeDir}/${getLatestCHBExport()} downloaded and copied to /${ExportCHBLatestZip}`
      )
  );

// The xml has 'ns1:' as a prefix at every node, this parser strips this prefix
const stripPrefix = xml2js.processors.stripPrefix;

// we also use these built in parsers to coerce types for string values like "true" and "34"
const parseBooleans = xml2js.processors.parseBooleans;
const parseNumbers = xml2js.processors.parseNumbers;

// construct xml to JSON parser
const parser = new xml2js.Parser({
  explicitArray: false,
  tagNameProcessors: [stripPrefix],
  valueProcessors: [parseNumbers, parseBooleans],
});

const parseCHBXMLtoJSON = () =>
  fs.readFile(`${__dirname}/${ExportCHBLatestXML}`, function (err, data) {
    parser.parseString(data, function (err, result) {
      fs.writeFile(
        `${ExportCHBLatestName}-amsterdam.json`,
        JSON.stringify(
          // Only include results from Amsterdam
          result.export.stopplaces.stopplace.filter(
            (el) => el.stopplacename.town === "Amsterdam"
          )
        ),
        "utf8",
        function (err) {
          if (err) console.error(err);
        }
      );

      // console.dir(autotypeResult);
      console.log("Done");
    });
  });

scrape(scraperOptions)
  .then(() => copyLatest())
  .then(() =>
    gunzip(ExportCHBLatestZip, ExportCHBLatestXML, () => {
      console.log(`${ExportCHBLatestZip} unzipped to ${ExportCHBLatestXML}`);
      parseCHBXMLtoJSON();
    })
  );
