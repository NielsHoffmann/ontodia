import {
    Dictionary, LocalizedString, LinkType, ClassModel, ElementModel, LinkModel,
    ElementIri, ClassIri, LinkTypeIri, PropertyTypeIri,
} from '../data/model';
import { DataProvider } from '../data/provider';
import { generate64BitID, uri2name } from '../data/utils';

import { EventSource, Events, EventObserver, AnyEvent, AnyListener, Listener } from '../viewUtils/events';

import {
    Element, ElementEvents, Link, LinkEvents, FatLinkType, FatLinkTypeEvents,
    FatClassModel, FatClassModelEvents, RichProperty,
} from './elements';
import { Vector } from './geometry';
import { Graph } from './graph';
import { CommandHistory, Command } from './history';

export interface DiagramModelEvents {
    changeCells: {};
    elementEvent: AnyEvent<ElementEvents>;
    linkEvent: AnyEvent<LinkEvents>;
    linkTypeEvent: AnyEvent<FatLinkTypeEvents>;
    classEvent: AnyEvent<FatClassModelEvents>;
    changeGroupContent: { group: string };
}

/**
 * Model of diagram.
 */
export class DiagramModel {
    protected source = new EventSource<DiagramModelEvents>();
    readonly events: Events<DiagramModelEvents> = this.source;

    protected graph = new Graph();
    protected graphListener = new EventObserver();

    constructor(
        readonly history: CommandHistory,
    ) {}

    get elements() { return this.graph.getElements(); }
    get links() { return this.graph.getLinks(); }

    getElement(elementId: string): Element | undefined {
        return this.graph.getElement(elementId);
    }

    getLinkById(linkId: string): Link | undefined {
        return this.graph.getLink(linkId);
    }

    linksOfType(linkTypeId: LinkTypeIri): ReadonlyArray<Link> {
        return this.graph.getLinks().filter(link => link.typeId === linkTypeId);
    }

    findLink(linkTypeId: LinkTypeIri, sourceId: string, targetId: string): Link | undefined {
        return this.graph.findLink(linkTypeId, sourceId, targetId);
    }

    sourceOf(link: Link) { return this.getElement(link.sourceId); }
    targetOf(link: Link) { return this.getElement(link.targetId); }
    isSourceAndTargetVisible(link: Link): boolean {
        return Boolean(this.sourceOf(link) && this.targetOf(link));
    }

    resetGraph() {
        if (this.graphListener) {
            this.graphListener.stopListening();
            this.graphListener = new EventObserver();
        }
        this.graph = new Graph();
    }

    subscribeGraph() {
        this.graphListener.listen(this.graph.events, 'changeCells', () => {
            this.source.trigger('changeCells', {});
        });
        this.graphListener.listen(this.graph.events, 'elementEvent', e => {
            this.source.trigger('elementEvent', e);
        });
        this.graphListener.listen(this.graph.events, 'linkEvent', e => {
            this.source.trigger('linkEvent', e);
        });
        this.graphListener.listen(this.graph.events, 'linkTypeEvent', e => {
            this.source.trigger('linkTypeEvent', e);
        });
        this.graphListener.listen(this.graph.events, 'classEvent', e => {
            this.source.trigger('classEvent', e);
        });

        this.source.trigger('changeCells', {source: this});
    }

    createElement(elementIriOrModel: ElementIri | ElementModel, group?: string): Element {
        const elementIri = typeof elementIriOrModel === 'string'
            ? elementIriOrModel : (elementIriOrModel as ElementModel).id;

        const elements = this.elements.filter(el => el.iri === elementIri && el.group === group);
        if (elements.length > 0) {
            // usually there should be only one element
            return elements[0];
        }

        let data = typeof elementIriOrModel === 'string'
            ? placeholderDataFromIri(elementIri)
            : elementIriOrModel as ElementModel;
        data = {...data, id: data.id};
        const element = new Element({id: `element_${generate64BitID()}`, data, group});
        this.history.execute(
            addElement(this.graph, element, [])
        );

        return element;
    }

    removeElement(elementId: string) {
        const element = this.getElement(elementId);
        if (element) {
            this.history.execute(
                removeElement(this.graph, element)
            );
        }
    }

    createLink(params: {
        linkType: FatLinkType;
        sourceId: string;
        targetId: string;
        data?: LinkModel;
        vertices?: ReadonlyArray<Vector>;
    }): Link {
        const {linkType, sourceId, targetId, data, vertices} = params;
        if (data && data.linkTypeId !== linkType.id) {
            throw new Error('linkTypeId must match linkType.id');
        }

        const existingLink = this.findLink(linkType.id, sourceId, targetId);
        if (existingLink) {
            existingLink.setLayoutOnly(false);
            existingLink.setData(data);
            return existingLink;
        }

        const shouldBeVisible = linkType.visible && this.getElement(sourceId) && this.getElement(targetId);
        if (!shouldBeVisible) {
            return undefined;
        }

        const link = new Link({
            id: `link_${generate64BitID()}`,
            typeId: linkType.id,
            sourceId,
            targetId,
            data,
            vertices,
        });
        this.graph.addLink(link);
        return link;
    }

    getClass(classIri: ClassIri): FatClassModel {
        return this.graph.getClass(classIri);
    }

    createClass(classIri: ClassIri): FatClassModel {
        const existing = this.graph.getClass(classIri);
        if (existing) {
            return existing;
        }
        const classModel = new FatClassModel({id: classIri});
        this.graph.addClass(classModel);
        return classModel;
    }

    getLinkType(linkTypeIri: LinkTypeIri): FatLinkType | undefined {
        return this.graph.getLinkType(linkTypeIri);
    }

    createLinkType(linkTypeIri: LinkTypeIri): FatLinkType {
        const existing = this.graph.getLinkType(linkTypeIri);
        if (existing) {
            return existing;
        }
        const linkType = new FatLinkType({id: linkTypeIri});
        this.graph.addLinkType(linkType);
        return linkType;
    }

    getProperty(propertyTypeIri: PropertyTypeIri): RichProperty {
        return this.graph.getProperty(propertyTypeIri);
    }

    createProperty(propertyIri: PropertyTypeIri): RichProperty {
        const existing = this.graph.getProperty(propertyIri);
        if (existing) {
            return existing;
        }
        const property = new RichProperty({id: propertyIri});
        this.graph.addProperty(property);
        return property;
    }

    triggerChangeGroupContent(group: string) {
        this.source.trigger('changeGroupContent', {group});
    }
}

export function placeholderDataFromIri(iri: ElementIri): ElementModel {
    return {
        id: iri,
        types: [],
        label: {values: []},
        properties: {},
    };
}

function addElement(graph: Graph, element: Element, connectedLinks: ReadonlyArray<Link>): Command {
    return Command.create('Add element', () => {
        graph.addElement(element);
        for (const link of connectedLinks) {
            const existing = graph.getLink(link.id) || graph.findLink(link.typeId, link.sourceId, link.targetId);
            if (!existing) {
                graph.addLink(link);
            }
        }
        return removeElement(graph, element);
    });
}

function removeElement(graph: Graph, element: Element): Command {
    return Command.create('Remove element', () => {
        const connectedLinks = [...element.links];
        graph.removeElement(element.id);
        return addElement(graph, element, connectedLinks);
    });
}

export function chooseLocalizedText(
    texts: ReadonlyArray<LocalizedString>,
    language: string
): LocalizedString | undefined {
    if (texts.length === 0) { return undefined; }
    let defaultValue: LocalizedString;
    let englishValue: LocalizedString;
    for (const text of texts) {
        if (text.lang === language) {
            return text;
        } else if (text.lang === '') {
            defaultValue = text;
        } else if (text.lang === 'en') {
            englishValue = text;
        }
    }
    return (
        defaultValue !== undefined ? defaultValue :
        englishValue !== undefined ? englishValue :
        texts[0]
    );
}

export function formatLocalizedLabel(
    fallbackIri: string,
    labels: ReadonlyArray<LocalizedString>,
    language: string
): string {
    return labels.length > 0
        ? chooseLocalizedText(labels, language).text
        : uri2name(fallbackIri);
}
