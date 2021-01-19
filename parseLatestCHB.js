const fs = require("fs");
// website-scraper downloads a page and files linked on that page
const scrape = require("website-scraper");
const SaveToExistingDirectoryPlugin = require("website-scraper-existing-directory");
// gunzips unzips files
const gunzip = require("gunzip-file");
// [xml2js](https://www.npmjs.com/package/xml2js) transforms XML to JSON
const xml2js = require("xml2js");

// import script to convert from rd to wsg84 coordinates
const rdToWgs84 = require("rd-to-wgs84");

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
const constantLatestString = `ExportCHBLatest`;
const constantLatestStringZip = `${constantLatestString}.xml.gz`;
const constantLatestStringXML = `${constantLatestString}.xml`;

// function to get the newest (simple sorted) ExportCHB* filename
const latestCHBExportName = () =>
  fs
    .readdirSync(scrapeDir)
    .filter((el) => el.slice(0, 9) === "ExportCHB")
    .sort()
    .slice(-1)[0];

// function to copy CHB file to root directory
const copyLatest = () =>
  fs.copyFile(
    `${scrapeDir}/${latestCHBExportName()}`,
    constantLatestStringZip,
    (el) =>
      console.log(
        `${scrapeDir}/${latestCHBExportName()} downloaded and copied to /${constantLatestStringZip}`
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
  fs.readFile(`${__dirname}/${constantLatestStringXML}`, function (err, data) {
    parser.parseString(data, function (err, result) {
      // just filter on Amsterdam so we have a json with all properties
      const filteredResultsAllProperties = result.export.stopplaces.stopplace.filter(
        (stopplace) => stopplace.stopplacename.town === "Amsterdam"
      );

      ///////////////////////////////
      // write away current and latest version, for versioning
      fs.writeFile(
        `${constantLatestString}-amsterdam.json`,
        JSON.stringify(
          // Only include results from Amsterdam
          filteredResultsAllProperties
        ),
        "utf8",
        function (err) {
          if (err) console.error(err);
        }
      );
      fs.writeFile(
        `${latestCHBExportName()}-amsterdam.json`,
        JSON.stringify(
          // Only include results from Amsterdam
          filteredResultsAllProperties
        ),
        "utf8",
        function (err) {
          if (err) console.error(err);
        }
      );

      ///////////////////////////////
      // Also create a version with flattened quays, still filtered on Amsterdam
      const quaysSelectionAmsterdam = filteredResultsAllProperties
        .map((stopplace) => {
          const { quays, ...stop } = stopplace; // destructure quays and stop objects in own constants
          const quaysWrapped =
            { ...quays }["quay"] instanceof Array
              ? { ...quays }["quay"]
              : [{ ...quays }["quay"]]; // if there is a single quay object, put it in an array so we can map over it

          const quaysWithStop = quaysWrapped
            .filter((el) => el) // remove empty arrays
            .filter((el) => el.quaystatusdata.quaystatus !== "outofuse") // filter out quays that are out of use
            .map((quay) => ({
              // map over each quay
              ...quay, // destructure whole quay object
              stopplace: stop, // also add the stopplace information
              geo: rdToWgs84(
                quay.quaylocationdata["rd-x"],
                quay.quaylocationdata["rd-y"]
              ), // add wsg84 coordinates
              direction: getCardinalDirectionShort(
                quay.quaybearing.compassdirection
              ),
              directionfull: getCardinalDirectionFull(
                quay.quaybearing.compassdirection
              ),
            }));
          return quaysWithStop;
        })
        .flat(); // flaten nested quay arrays

      // write away current and latest version, for versioning
      fs.writeFile(
        `${constantLatestString}-quays-selection-amsterdam.json`,
        JSON.stringify(
          // Only include results from Amsterdam
          quaysSelectionAmsterdam
        ),
        "utf8",
        function (err) {
          if (err) console.error(err);
        }
      );
      fs.writeFile(
        `${latestCHBExportName()}-quaysselection-amsterdam.json`,
        JSON.stringify(
          // Only include results from Amsterdam
          quaysSelectionAmsterdam
        ),
        "utf8",
        function (err) {
          if (err) console.error(err);
        }
      );

      ///////////////////////////////
      // Also create a version with flattened quays and selected properties, still filtered on Amsterdam
      const quaysAndPropsSelectionAmsterdam = quaysSelectionAmsterdam.map(
        (quay) => ({
          // map over each quay
          // ...quay, // destructure whole quay object
          quaycode: quay.quaycode,
          quayname: quay.quaynamedata.quayname, // also add the stopplace information,
          quaystatus: quay.quaystatusdata.quaystatus,
          transportmode:
            quay.quaytransportmodes.transportmodedata.transportmode,
          lat: quay.geo.lat,
          lon: quay.geo.lon,
          visuallyaccessible:
            quay.quayvisuallyaccessible.visuallyaccessible === "Y",
          disabledaccessible:
            quay.quaydisabledaccessible.disabledaccessible === "Y",
          compassdirection: quay.quaybearing.compassdirection,
          ...quay.quayaccessibilityadaptions,
          direction: quay.direction,
          directionfull: quay.directionfull,
        })
      );

      // write away current and latest version, for versioning
      fs.writeFile(
        `${constantLatestString}-quays-and-props-selection-amsterdam.json`,
        JSON.stringify(
          // Only include results from Amsterdam
          quaysAndPropsSelectionAmsterdam
        ),
        "utf8",
        function (err) {
          if (err) console.error(err);
        }
      );
      fs.writeFile(
        `${latestCHBExportName()}-quays-and-props-selection-amsterdam.json`,
        JSON.stringify(
          // Only include results from Amsterdam
          quaysAndPropsSelectionAmsterdam
        ),
        "utf8",
        function (err) {
          if (err) console.error(err);
        }
      );
      console.log("Done");
    });
  });

scrape(scraperOptions)
  .then(() => copyLatest())
  .then(() =>
    gunzip(constantLatestStringZip, constantLatestStringXML, () => {
      console.log(
        `${constantLatestStringZip} unzipped to ${constantLatestStringXML}`
      );
      parseCHBXMLtoJSON();
    })
  );

function getCardinalDirectionShort(angle) {
  const directionsShort = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
  return directionsShort[Math.round(angle / 45) % 8];
}

function getCardinalDirectionFull(angle) {
  const directionsFull = [
    "Noord",
    "Noordoost",
    "Oost",
    "Zuidoost",
    "Zuid",
    "Zuidwest",
    "West",
    "Noordwest",
  ];
  return directionsFull[Math.round(angle / 45) % 8];
}
