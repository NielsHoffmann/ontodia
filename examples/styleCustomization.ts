import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import { Workspace, WorkspaceProps, SparqlDataProvider, LinkTemplate } from '../src/ontodia/index';

import { onPageLoad, tryLoadLayoutFromLocalStorage, saveLayoutToLocalStorage } from './common';

// const certificateIcon = require<string>('../images/font-awesome/certificate-solid.svg');
// const cogIcon = require<string>('../images/font-awesome/cog-solid.svg');

const certificateIcon = require('../images/font-awesome/certificate-solid.svg');
const cogIcon = require('../images/font-awesome/cog-solid.svg');

const CUSTOM_LINK_TEMPLATE: LinkTemplate = {
    markerSource: {
        fill: '#4b4a67',
        stroke: '#4b4a67',
        d: 'M0,3a3,3 0 1,0 6,0a3,3 0 1,0 -6,0',
        width: 6,
        height: 6,
    },
    markerTarget: {
        fill: '#4b4a67',
        stroke: '#4b4a67',
        d: 'm 20,5.88 -10.3,-5.95 0,5.6 -9.7,-5.6 0,11.82 9.7,-5.53 0,5.6 z',
        width: 20,
        height: 12,
    },
    renderLink: () => ({
        connection: {
            stroke: '#3c4260',
            'stroke-width': 2,
        },
        connector: {name: 'rounded'},
        label: {
            attrs: {text: {fill: '#3c4260'}},
        },
    }),
};

function onWorkspaceMounted(workspace: Workspace) {
    if (!workspace) { return; }

    const diagram = tryLoadLayoutFromLocalStorage();
    workspace.getModel().importLayout({
        diagram,
        dataProvider: new SparqlDataProvider({
            endpointUrl: '/sparql',
            imagePropertyUris: [
                'http://collection.britishmuseum.org/id/ontology/PX_has_main_representation',
                'http://xmlns.com/foaf/0.1/img',
            ],
        }),
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
    typeStyleResolver: types => {
        if (types.indexOf('http://www.w3.org/2000/01/rdf-schema#Class') !== -1) {
            return {icon: certificateIcon};
        } else if (types.indexOf('http://www.w3.org/2002/07/owl#Class') !== -1) {
            return {icon: certificateIcon};
        } else if (types.indexOf('http://www.w3.org/2002/07/owl#ObjectProperty') !== -1) {
            return {icon: cogIcon};
        } else if (types.indexOf('http://www.w3.org/2002/07/owl#DatatypeProperty') !== -1) {
            return {color: '#046380'};
        } else {
            return undefined;
        }
    },
    linkTemplateResolver: type => CUSTOM_LINK_TEMPLATE,
};

onPageLoad(container => ReactDOM.render(createElement(Workspace, props), container));
