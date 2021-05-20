import { DataFrame, IArray, Serie } from "@youwol/dataframe";
import { Property, Schema } from "@youwol/flux-core";
import { BufferGeometry, Material, Mesh } from "three";
import { pack } from './main'

import * as FluxThree from '@youwol/flux-three'

/**
 * ## KeplerMesh
 * 
 * A Kepler mesh describes a 3D structure for which every vertex are associated
 * to a line of a provided
 *  [[https://youwol.github.io/dataframe/dist/docs/pages/Info/description.html | Dataframe]].
 * 
 * See also:
 * -  [[https://threejs.org/docs/#api/en/objects/Mesh | three.js Mesh]]: the underlying 
 * representation of the mesh
 * 
 */
export class KeplerMesh extends Mesh {

    constructor(
        geometry: BufferGeometry,
        material: Material,
        public readonly dataframe: DataFrame) {
        super(geometry, material)
    }
}

export let LookUpTables = [
    'Cooltowarm',
    'Blackbody',
    'Grayscale',
    'Insar',
    'Rainbow',
    'Igeoss',
    'Blue_White_Red',
    'Blue_Green_Red',
    'Spectrum',
    'Default',
    'Banded'
]

@Schema({
    pack
})
export class SkinConfiguration extends FluxThree.Schemas.Object3DConfiguration {

    static defaultCode = `
/*
*/
return (df, algorithms) => df.get('A')
`

    /**
     * The observableFunction is a function that map a line of 
     * a [[KeplerMesh.Dataframe]] to the quantity of interest to observe.
     * 
     * Each line of the dataframe correspond to some properties available 
     * for a particular vertex. The dimension of the quantity to observe 
     * depends on the skin used: for most of them it is a scalar (e.g. for [[ModuleIsoContours]]),
     * but there can be cases (e.g. streamlines) where a 3D vector is expected.
     */
    @Property({
        description: "DataFrame to target attribute mapping function",
        type: "code"
    })
    readonly observableFunction: string | ((DataFrame, any) => Serie<IArray>)

    getObservableFunction(): (DataFrame, any) => Serie<IArray> {

        if (typeof (this.observableFunction) == 'string')
            return new Function(this.observableFunction)()

        return this.observableFunction
    }

    constructor({ observableFunction, ...others }: { observableFunction?: string | ((DataFrame, any) => Serie<IArray>), others?: any } = {}) {
        super(others as any)
        this.observableFunction = observableFunction != undefined
            ? observableFunction
            : SkinConfiguration.defaultCode

    }
}
