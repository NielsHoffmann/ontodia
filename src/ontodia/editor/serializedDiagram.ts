import { pick } from 'lodash';

import { ElementIri, LinkTypeIri } from '../data/model';

import { Element as DiagramElement, Link as DiagramLink } from '../diagram/elements';
import { Vector, Size } from '../diagram/geometry';

export interface SerializedDiagram {
    '@context': any;
    '@type': 'Diagram';
    layoutData: LayoutData;
    linkTypeOptions: LinkTypeOptions[];
}

export interface LinkTypeOptions {
    '@type': 'LinkTypeOptions';
    property: LinkTypeIri;
    visible: boolean;
    showLabel?: boolean;
}

export interface LayoutData {
    '@type': 'Layout';
    readonly elements: LayoutElement[];
    readonly links: LayoutLink[];
}

export interface LayoutElement {
    '@type': 'Element';
    '@id': string;
    iri: ElementIri;
    position: Vector;
    size?: Size;
    angle?: number;
    isExpanded?: boolean;
    group?: string;
}

export interface LayoutLink {
    '@type': 'Link';
    '@id': string;
    property: LinkTypeIri;
    source: { '@id': string };
    target: { '@id': string };
    vertices?: ReadonlyArray<Vector>;
}

const serializedCellProperties = [
    'id', 'type',                              // common properties
    'size', 'angle', 'isExpanded', 'position', 'iri', 'group', // element properties
    'typeId', 'source', 'target', 'vertices',  // link properties
];

export function emptyDiagram(): SerializedDiagram {
    return {
        ...diagramContextV1AsUrl,
        '@type': 'Diagram',
        layoutData: emptyLayoutData(),
        linkTypeOptions: []
    };
}

export function emptyLayoutData(): LayoutData {
    return {'@type': 'Layout', elements: [], links: []};
}

export function convertToSerializedDiagram(params: {layoutData: any, linkTypeOptions: any}): SerializedDiagram {
    let elements: LayoutElement[] = [];
    let links: LayoutLink[] = [];

    for (const cell of params.layoutData.cells) {

        // get rid of unused properties
        let newCell: any = pick(cell, serializedCellProperties);

        // normalize type
        if (newCell.type === 'Ontodia.Element' || newCell.type === 'element') {
            newCell.type = 'Element';
        }

        // normalize type
        if (newCell.type === 'link') {
            newCell.type = 'Link';
        }

        if (!newCell.iri) {
            newCell.iri = newCell.id;
        }

        // rename to @id and @type to match JSON-LD
        newCell['@id'] = newCell.id;
        delete newCell.id;

        newCell['@type'] = newCell.type;
        delete newCell.type;

        // make two separate lists
        switch (newCell['@type']) {
            case 'Element':
                elements.push(newCell);
                break;
            case 'Link':
                // rename internal IDs
                newCell.source['@id'] = newCell.source.id;
                delete newCell.source.id;
                newCell.target['@id'] = newCell.target.id;
                delete newCell.target.id;
                // rename typeID to property
                newCell.property = newCell.typeId;
                delete newCell.typeId;
                links.push(newCell);
                break;
        }
    }

    return {
        ...emptyDiagram(),
        layoutData: {'@type': 'Layout', elements, links},
        linkTypeOptions: params.linkTypeOptions
    };
}

export function makeSerializedDiagram(
        params: {layoutData: LayoutData, linkTypeOptions: LinkTypeOptions[]}
    ): SerializedDiagram {
    return {...emptyDiagram(), layoutData: params.layoutData, linkTypeOptions: params.linkTypeOptions};
}

export function makeLayoutData(
    modelElements: ReadonlyArray<DiagramElement>,
    modelLinks: ReadonlyArray<DiagramLink>,
): LayoutData {
    const elements = modelElements.map((element): LayoutElement => ({
        '@type': 'Element',
        '@id': element.id,
        iri: element.iri,
        position: element.position,
        size: element.size,
        isExpanded: element.isExpanded,
        group: element.group,
    }));
    const links = modelLinks.map((link): LayoutLink => ({
        '@type': 'Link',
        '@id': link.id,
        property: link.typeId,
        source: {'@id': link.sourceId},
        target: {'@id': link.targetId},
        vertices: [...link.vertices],
    }));
    return {'@type': 'Layout', elements, links};
}

export const diagramContextV1AsUrl = {
    '@context': 'https://ontodia.org/context/v1.json'
};

export const diagramContextV1 = {
    '@context': {
        // schemas
        'ontodia': 'http://ontodia.org/schema/v1#',
        'xsd': 'http://www.w3.org/2001/XMLSchema#',
        // classes
        'Diagram': 'ontodia:Diagram',
        'Element': 'ontodia:Element',
        'Link': 'ontodia:Link',
        'Layout': 'ontodia:Layout',
        'LinkTypeOptions': 'ontodia:LinkTypeOptions',
        // properties
        'layoutData': 'ontodia:layoutData',
        'elements': {'@id': 'ontodia:hasElement', '@container': '@set'},
        'linkTypeOptions': 'ontodia:linkTypeOptions',
        'links': {'@id': 'ontodia:hasLink', '@container': '@set'},
        // element
        'iri': {'@id': 'ontodia:resource', '@type': '@id'},
        'position': 'ontodia:position',
        'x': {'@id': 'ontodia:xCoordValue'},
        'y': {'@id': 'ontodia:yCoordValue'},
        'size': 'ontodia:size',
        'height': {'@id': 'ontodia:height'},
        'width': {'@id': 'ontodia:width'},
        'isExpanded': {'@id': 'ontodia:isExpanded'},
        // link
        'property': {'@id': 'ontodia:property', '@type': '@id'},
        'source': 'ontodia:source',
        'target': 'ontodia:target',
        'vertices': {'@id': 'ontodia:vertex', '@container' : '@list'},
        '@base': 'http://ontodia.org/data/',
        // link type options
        'visible': 'ontodia:visible',
        'showLabel': 'ontodia:showLabel',
    }
};
