import JupiterDoc from "./jupiter.js";
// import utils from './utils.js';

var docs = [];
var factTypes = [];
var docTypes = [];
var tags = [];

const jupiterDocs = [];

// fetch data from json files and put them into variables
const getDocs = () => {
  return fetch("../data/documents.json")
    .then((res) => res.json())
    .then((data) => {
      return data;
    });
};

const getFactTypes = () => {
  return fetch("../data/factTypes.json")
    .then((res) => res.json())
    .then((data) => {
      return data;
    });
};

const getDocTypes = () => {
  return fetch("../data/documentTypes.json")
    .then((res) => res.json())
    .then((data) => {
      return data;
    });
};

const getTags = () => {
  return fetch("../data/tags.json")
    .then((res) => res.json())
    .then((data) => {
      return data;
    });
};

// await all fetches to complete with Promise.all

const getAllLookups = async () => {
  docs = await getDocs();
  factTypes = await getFactTypes();
  docTypes = await getDocTypes();
  tags = await getTags();
  return { docs, factTypes, docTypes };
};

// wait until arrays are filled
await getAllLookups();

const documentsDiv = document.querySelector(".documents");

docs.forEach((doc, index) => {
  // jupiterDocs.push(new JupiterDoc(doc, factTypes, docTypes, tags));
  jupiterDocs.push(new JupiterDoc(doc, factTypes, [], []));
});

// filter jupiter docs and iterate to display data
jupiterDocs
  .filter((x) => x.lease_terms.length > 0)
  .forEach((doc, index) => {
    let p = document.createElement("p");
    p.setAttribute("class", "document");
    p.innerHTML = index + " - " + doc.name;
    documentsDiv.appendChild(p);
  });

console.log(jupiterDocs.filter((x) => x.id === "75bde42a-9541-47e3-93a9-d3b34ff53305")[0]);
console.log("test");

// for (let i = 0; i < 10; i++) {
//     console.log(utils.round(utils.calculateCompoundingGrowth(75000, 0.1, i), 4));
//     console.log(utils.round(utils.calculateGrowth(75000, 0.1, i), 4));
// }

export default {};
