import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import {
    Workspace,
    WorkspaceProps,
    RDFDataProvider,
    CompositeDataProvider,
    SparqlDataProvider,
    SparqlQueryMethod,
    WikidataSettings,
    LinkModel,
 } from '../src/ontodia/index';

const N3Parser: any = require('rdf-parser-n3');
const RdfXmlParser: any = require('rdf-parser-rdfxml');
const JsonLdParser: any = require('rdf-parser-jsonld');

import { onPageLoad, tryLoadLayoutFromLocalStorage, saveLayoutToLocalStorage } from './common';
import { LinkBinding } from '../src/ontodia/data/sparql/sparqlModels';
import { getLinksInfo } from '../src/ontodia/data/sparql/responseHandler';

//const data = require<string>('./resources/orgOntology.ttl');
const data = require('./resources/orgOntology.ttl');
//import config = require('./resources/orgOntology.ttl');
//const data = config();

class TransformingDataProvider extends SparqlDataProvider {

    createRefQueryPart(params: { elementId: string; linkId?: string; direction?: 'in' | 'out'}): string {
        let refQueryPart = '';
        const refElementIRI = `<${params.elementId}>`;
        const refElementLinkIRI = params.linkId ? `<${params.linkId}>` : undefined;

        //  link to element with specified link type
        // if direction is not specified, provide both patterns and union them
        // FILTER ISIRI is used to prevent blank nodes appearing in results
        if (params.elementId && params.linkId) {
            refQueryPart += !params.direction || params.direction === 'out' ? `
                { ${refElementIRI} ${refElementLinkIRI} ?inst . FILTER ISIRI(?inst)}
                UNION
                { ${refElementIRI} ${refElementLinkIRI} ?literalId.
    		        ?property <http://wikiba.se/ontology#directClaim> ${refElementLinkIRI}.
    		        ?property wdt:P1630|wdt:P1921 ?template.
                    BIND(IRI(REPLACE(?template, "\\\\$1", ?literalId)) as ?inst)
                }
                ` : '';
            refQueryPart += !params.direction ? ' UNION ' : '';
            refQueryPart += !params.direction ||
                params.direction === 'in' ?
                    `{  ?inst ${refElementLinkIRI} ${refElementIRI} . FILTER ISIRI(?inst)}` : '';
        }

        // all links to current element
        if (params.elementId && !params.linkId) {
            refQueryPart += !params.direction || params.direction === 'out' ? `
                { ${refElementIRI} ?link ?inst . FILTER ISIRI(?inst)}
                UNION
                { ${refElementIRI} ?link ?literalId.
    		        ?property <http://wikiba.se/ontology#directClaim> ?link.
    		        ?property wdt:P1630|wdt:P1921 ?template.
                    BIND(IRI(REPLACE(?template, "\\\\$1", ?literalId)) as ?inst)
                }
                ` : '';
            refQueryPart += !params.direction ? ' UNION ' : '';
            refQueryPart += !params.direction ||
                params.direction === 'in' ?
                    `{  ?inst ?link ${refElementIRI} . FILTER ISIRI(?inst)}` : '';
        }
        return refQueryPart;
    }

    linksInfo(params: {
        elementIds: string[];
        linkTypeIds: string[];
    }): Promise<LinkModel[]> {
        const ids = params.elementIds.map(uri => `<${uri}>`).map(id => ` ( ${id} )`).join(' ');
        const query = `PREFIX wdt: <http://www.wikidata.org/prop/direct/>

            SELECT ?source ?type ?target
            WHERE {
                VALUES (?source) {${ids}}
                VALUES (?target) {${ids}}
                {?source ?type ?target.}
                UNION
                {
                    ?source ?type ?literalId.
                    FILTER(ISLITERAL(?literalId))
    		        ?property <http://wikiba.se/ontology#directClaim> ?type.
    		        ?property wdt:P1630|wdt:P1921 ?template.
                    BIND(IRI(REPLACE(?template, "\\\\$1", ?literalId)) as ?createdTarget)
                    BIND(?createdTarget as ?target)
                    FILTER (BOUND(?createdTarget))
                }
            }
        `;
        return this.executeSparqlQuery<LinkBinding>(query).then(getLinksInfo);
    }
}

function onWorkspaceMounted(workspace: Workspace) {
    if (!workspace) { return; }

    const rdfDataProvider = new RDFDataProvider({
        data: [
            {content: data, type: 'text/turtle'},
        ],
        dataFetching: true,
        parsers: {
            'text/turtle': new N3Parser(),
            'application/rdf+xml': new RdfXmlParser(),
            'application/ld+json': new JsonLdParser(),
        },
    });

    const sparqlDataProvider = new TransformingDataProvider({
        endpointUrl: '/wikidata',
        imagePropertyUris: [
            'http://www.wikidata.org/prop/direct/P18',
            'http://www.wikidata.org/prop/direct/P154',
        ],
        queryMethod: SparqlQueryMethod.POST,
    }, {...WikidataSettings, ...{
        linkTypesOfQuery: `SELECT DISTINCT ?link
        WHERE {
            {
                \${elementIri} ?link ?outObject
                # this is to prevent some junk appear on diagram,
                # but can really slow down execution on complex objects
                #FILTER ISIRI(?outObject)
                #FILTER EXISTS { ?outObject ?someprop ?someobj }
            } UNION {
                ?inObject ?link \${elementIri}
                #FILTER ISIRI(?inObject)
                #FILTER EXISTS { ?inObject ?someprop ?someobj }
            } UNION {
                $\{elementIri} ?link ?outObject.
                ?property <http://wikiba.se/ontology#directClaim> ?link.
            }
            FILTER regex(STR(?link), "direct")
        }`,
        linkTypesStatisticsQuery: `SELECT ?link ?outCount ?inCount
        WHERE {
            {{
                SELECT (\${linkId} as ?link) (count(?outObject) as ?outCount) WHERE {
                    \${elementIri} \${linkId} ?outObject
                    FILTER ISIRI(?outObject)
                    FILTER EXISTS { ?outObject ?someprop ?someobj }
                } LIMIT 101
            } {
                SELECT (\${linkId} as ?link) (count(?inObject) as ?inCount) WHERE {
                    ?inObject \${linkId} \${elementIri}
                    FILTER ISIRI(?inObject)
                    FILTER EXISTS { ?inObject ?someprop ?someobj }
                } LIMIT 101
            }} UNION {
                SELECT (\${linkId} as ?link) (count(?outObject) as ?outCount) (0 as ?inCount) WHERE {
                    $\{elementIri} \${linkId} ?outObject.
                    ?property <http://wikiba.se/ontology#directClaim> \${linkId}.
                } LIMIT 101
            }
        }`,
        filterAdditionalRestriction: `FILTER ISIRI(?inst)
                        BIND(STR(?inst) as ?strInst)
`,
    }});

    const diagram = tryLoadLayoutFromLocalStorage();
    workspace.getModel().importLayout({
        diagram,
        validateLinks: true,
        dataProvider: new CompositeDataProvider(
            [
                {name: 'SPARQL Provider', dataProvider: sparqlDataProvider},
                {name: 'RDF Provider', dataProvider: rdfDataProvider},
            ],
            {mergeMode: 'sequentialFetching'}
        ),
    });
}

const props: WorkspaceProps & ClassAttributes<Workspace> = {
    ref: onWorkspaceMounted,
    onSaveDiagram: workspace => {
        const diagram = workspace.getModel().exportLayout();
        window.location.hash = saveLayoutToLocalStorage(diagram);
        window.location.reload();
    },
    viewOptions: {
        onIriClick: ({iri}) => window.open(iri),
    },
};

onPageLoad(container => ReactDOM.render(createElement(Workspace, props), container));
