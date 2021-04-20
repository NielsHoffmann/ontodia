import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import {
    Workspace, WorkspaceProps, SparqlDataProvider, SparqlQueryMethod
} from '../src/ontodia/index';

import { onPageLoad, tryLoadLayoutFromLocalStorage, saveLayoutToLocalStorage } from './common';

function onWorkspaceMounted(workspace: Workspace) {
    if (!workspace) { return; }

    const diagram = tryLoadLayoutFromLocalStorage();
    workspace.getModel().importLayout({
        diagram,
        validateLinks: true,
        dataProvider: new SparqlDataProvider({
            endpointUrl: 'http://10.0.0.119:7200/repositories/datahub?infer=false',
            queryMethod: SparqlQueryMethod.GET,
            acceptBlankNodes: true,
            //queryFunction: new SparqlDataProvider.queryFunction({Headers:()})
        }, ),
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
    languages: [
        {code: 'nl', label: 'Nederlands'},
    ],
    language: 'nl'
};

onPageLoad(container => ReactDOM.render(createElement(Workspace, props), container));
