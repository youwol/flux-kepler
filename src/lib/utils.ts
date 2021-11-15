import { expectAllOf, expect, expectAnyOf, expectInstanceOf } from "@youwol/flux-core"
import { Group } from "three"


export function keplerObjectsExpectation(typeName: string, attNames: string[], KeplerType: any) {
    return expectAnyOf({
        description: `A ${typeName} or a group of 3D objects containing ${typeName}`,
        when: [
            expectInstanceOf({
                typeName: typeName,
                Type: KeplerType, attNames
            }),
            expectAllOf({
                description: `A group of 3D objects containing ${typeName}`,
                when: [
                    expectInstanceOf({ typeName: 'Group', Type: Group }),
                    expect({
                        description: `The group contains ${typeName}`,
                        when: (group: Group) => group.children.find(child => child instanceof KeplerType) != undefined,
                        normalizeTo: (group: Group) => group.children.filter(child => child instanceof KeplerType)
                    })
                ],
                normalizeTo: (accData: [Group, typeof KeplerType[]]) => accData[1]
            })
        ],
        normalizeTo: (data: typeof KeplerType | typeof KeplerType[]) => {
            return (Array.isArray(data)) ? data : [data]
        }
    })
}
