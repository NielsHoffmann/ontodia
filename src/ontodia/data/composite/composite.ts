import { DataProvider, FilterParams } from '../provider';
import {
    Dictionary,
    ClassModel,
    LinkType,
    ElementModel,
    LinkModel,
    LinkCount,
    Property,
    PropertyModel,
    LocalizedString,
} from '../model';
import {
    CompositeResponse,
    mergeClassTree,
    mergePropertyInfo,
    mergeClassInfo,
    mergeLinkTypesInfo,
    mergeLinkTypes,
    mergeElementInfo,
    mergeLinksInfo,
    mergeLinkTypesOf,
    mergeLinkElements,
    mergeFilter,
} from './mergeUtils';

export interface DPDefinition {
    name: string;
    dataProvider: DataProvider;
}

function isDefenition(dp: DataProvider | DPDefinition): dp is DPDefinition {
    return (<DPDefinition> dp).name !== undefined && (<DPDefinition> dp).dataProvider !== undefined;
}

export type MergeMode = 'fetchAll' | 'sequentialFetching';

export class CompositeDataProvider implements DataProvider {
    public dataProviders: DPDefinition[];
    public mergeMode: MergeMode = 'fetchAll';

    constructor(
        dataProviders: (DataProvider | DPDefinition)[],
        params?: {
            mergeMode?: MergeMode,
        },
    ) {
        let dpCounter = 1;
        this.dataProviders = dataProviders.map(dp => {
            if (isDefenition(dp)) {
                return dp;
            } else {
                return {
                    name: 'dataProvider_' + dpCounter++,
                    dataProvider: dp,
                };
            }
        });

        if (params && params.mergeMode) {
            this.mergeMode = params.mergeMode;
        }
    }

    classTree(): Promise<ClassModel[]> {
        return this.fetchSequentially('classTree', mergeClassTree);
    }

    propertyInfo(params: { propertyIds: string[] }): Promise<Dictionary<PropertyModel>> {
        if (this.mergeMode === 'fetchAll') {
            return this.fetchSequentially('propertyInfo', mergePropertyInfo, params);
        } else {
            let propertyIds = params.propertyIds;
            return this.queueProcessResults((previousResult: Dictionary<PropertyModel>, dp: DPDefinition) => {
                propertyIds = propertyIds.filter(id => !previousResult || !previousResult[id]);
                return propertyIds.length > 0 ? dp.dataProvider.propertyInfo({ propertyIds: propertyIds }) : undefined;
            }).then(mergePropertyInfo);
        }
    }

    classInfo(params: { classIds: string[] }): Promise<ClassModel[]> {
        if (this.mergeMode === 'fetchAll') {
            return this.fetchSequentially('classInfo', mergeClassInfo, params);
        } else {
            let classIds = params.classIds;
            return this.queueProcessResults((previousResult: ClassModel[], dp: DPDefinition) => {
                classIds = classIds.filter(id => !previousResult || previousResult.map(cm => cm.id).indexOf(id) === -1);
                return classIds.length > 0 ? dp.dataProvider.classInfo({ classIds: classIds }) : undefined;
            }).then(mergeClassInfo);
        }
    }

    linkTypesInfo(params: {linkTypeIds: string[]}): Promise<LinkType[]> {
        if (this.mergeMode === 'fetchAll') {
            return this.fetchSequentially('linkTypesInfo', mergeLinkTypesInfo, params);
        } else {
            let linkTypeIds = params.linkTypeIds;
            return this.queueProcessResults((previousResult: LinkType[], dp: DPDefinition) => {
                linkTypeIds = linkTypeIds.filter(id =>
                    !previousResult || previousResult.map(lt => lt.id).indexOf(id) === -1);
                return linkTypeIds.length > 0 ? dp.dataProvider.linkTypesInfo({ linkTypeIds: linkTypeIds }) : undefined;
            }).then(mergeLinkTypesInfo);
        }
    }

    linkTypes(): Promise<LinkType[]> {
        return this.fetchSequentially('linkTypes', mergeLinkTypes);
    }

    elementInfo(params: { elementIds: string[]; }): Promise<Dictionary<ElementModel>> {
        if (this.mergeMode === 'fetchAll') {
            return this.fetchSequentially('elementInfo', mergeElementInfo, params);
        } else {
            let elementIds = params.elementIds;
            return this.queueProcessResults((previousResult: Dictionary<ElementModel>, dp: DPDefinition) => {
                elementIds = elementIds.filter(id => !previousResult || !previousResult[id]);
                return elementIds.length > 0 ? dp.dataProvider.elementInfo({ elementIds: elementIds }) : undefined;
            }).then(mergeElementInfo);
        }
    }

    linksInfo(params: {
        elementIds: string[];
        linkTypeIds: string[];
    }): Promise<LinkModel[]> {
        if (this.mergeMode === 'fetchAll') {
            return this.fetchSequentially('linksInfo', mergeLinksInfo, params);
        } else {
            let elementIds = params.elementIds;
            return this.queueProcessResults((previousResult: LinkModel[], dp: DPDefinition) => {
                elementIds = elementIds.filter(id => {
                    if (previousResult) {
                        for (const linkModel of previousResult) {
                            if (linkModel.sourceId === id) { return false; }
                        }
                    }
                    return true;
                });
                return elementIds.length > 0 ?
                    dp.dataProvider.linksInfo({ elementIds: elementIds, linkTypeIds: params.linkTypeIds }) : undefined;
            }).then(mergeLinksInfo);
        }
    }

    linkTypesOf(params: { elementId: string; }): Promise<LinkCount[]> {
        if (this.mergeMode === 'fetchAll') {
            return this.fetchSequentially('linkTypesOf', mergeLinkTypesOf, params);
        } else {
            return this.queueProcessResults((previousResult: LinkCount[], dp: DPDefinition) => {
                if (!previousResult || previousResult && previousResult.length === 0) {
                    return dp.dataProvider.linkTypesOf(params);
                } else {
                    return undefined;
                }
            }).then(mergeLinkTypesOf);
        }
    };

    linkElements(params: {
        elementId: string;
        linkId: string;
        limit: number;
        offset: number;
        direction?: 'in' | 'out';
    }): Promise<Dictionary<ElementModel>> {
        if (this.mergeMode === 'fetchAll') {
            return this.fetchSequentially('linkElements', mergeLinkElements, params);
        } else {
            return this.queueProcessResults((previousResult: Dictionary<ElementModel>, dp: DPDefinition) => {
                if (!previousResult || previousResult && Object.keys(previousResult).length === 0) {
                    return dp.dataProvider.linkElements(params);
                } else {
                    return undefined;
                }
            }).then(mergeLinkElements);
        }
    }

    filter(params: FilterParams): Promise<Dictionary<ElementModel>> {
        if (this.mergeMode === 'fetchAll') {
            return this.fetchSequentially('filter', mergeFilter, params);
        } else {
            return this.queueProcessResults((previousResult: Dictionary<ElementModel>, dp: DPDefinition) => {
                if (!previousResult || previousResult && Object.keys(previousResult).length === 0) {
                    return dp.dataProvider.filter(params);
                } else {
                    return undefined;
                }
            }).then(mergeFilter);
        }
    };

    private processResults<ResponseType>(
        responsePromise: Promise<ResponseType>,
        dpName: string,
    ): Promise<CompositeResponse<ResponseType>> {
        return responsePromise
            .then(response => ({dataSourceName: dpName, response: response}))
            .catch(error => {
                console.error(error);
                return {dataSourceName: dpName, response: undefined};
            });
    };

    private queueProcessResults<ResponseType>(
        callBack: (previousResult: ResponseType, dp: DPDefinition) => Promise<ResponseType>,
    ): Promise<CompositeResponse<ResponseType>[]> {
        let counter = 0;
        let responseList: CompositeResponse<ResponseType>[] = [];

        const recursiveCall = (result?: ResponseType): Promise<CompositeResponse<ResponseType>[]> => {
            if (this.dataProviders.length > counter) {
                const dp = this.dataProviders[counter++];
                const callBackResult = callBack(result, dp);

                if (!callBackResult) { return Promise.resolve(responseList); }
                return callBackResult.then(newResult => {
                    responseList.push({
                        dataSourceName: dp.name,
                        response: newResult,
                    });
                    return recursiveCall(newResult);
                }).catch(error => {
                    console.error(error);
                    return recursiveCall(result);
                });
            } else {
                return Promise.resolve(responseList);
            }
        };
        return recursiveCall();
    };

    private fetchSequentially<ResponseType>(
        functionName: string, mergeFunction: (...args: any[]) => ResponseType, params?: any,
    ) {
        const resultPromises = this.dataProviders.map(
            (dp: any) => this.processResults(dp.dataProvider[functionName].call(dp.dataProvider, params), dp.name),
        );
        return Promise.all(resultPromises).then(mergeFunction);
    }
}
