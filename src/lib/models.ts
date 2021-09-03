import { DataFrame, IArray, Serie } from "@youwol/dataframe";
import { Property, Schema } from "@youwol/flux-core";
import { BufferGeometry, Material, Mesh, Points, PointsMaterial } from "three";
import { pack } from './main'

import * as FluxThree from '@youwol/flux-three'


export interface KeplerObject3D {
    geometry: BufferGeometry
    material: Material | Material[]
    dataframe: DataFrame
    name: string
    userData: {[key:string]: any}
}
/**
 * ## KeplerMesh
 * 
 * A Kepler mesh describes a 3D structure for which every vertex are associated
 * to a line of a provided [[dataframe]].
 * 
 * There are various ways to create a Kepler Mesh, the [[ModuleLoader]] is one example. 
 *
 * ## Technical details
 * 
 * KeplerMesh inherits from  [[https://threejs.org/docs/#api/en/objects/Mesh | three.js Mesh]].
 * The dataframe is supported by this 
 *  [[https://youwol.github.io/dataframe/dist/docs/pages/Info/description.html | library]].
 * 
 */
export class KeplerMesh extends Mesh {

    /**
     * The dataframe associated to the 3D structure. 
     * Rows' count and order match those of the vertex.
     */
    public readonly dataframe : DataFrame

    constructor(
        geometry: BufferGeometry,
        material: Material | Material[],
        dataframe: DataFrame) {
        super(geometry, material)
        this.dataframe = dataframe
    }
}


/**
 * ## KeplerPoints
 * 
 * A Kepler points describes a set of points in the 3D space associated
 * to a set of properties (a line of a provided [[dataframe]]).
 * 
 * There are various ways to create a KeplerPoints, the [[ModuleLoader]] is one example. 
 *
 * ## Technical details
 * 
 * KeplerPoints inherits from  [[https://threejs.org/docs/#api/en/objects/Points | three.js Mesh]].
 * The dataframe is supported by this 
 *  [[https://youwol.github.io/dataframe/dist/docs/pages/Info/description.html | library]].
 * 
 */
 export class KeplerPoints extends Points {

    /**
     * The dataframe associated to the 3D structure. 
     * Rows' count and order match those of the vertex.
     */
    public readonly dataframe : DataFrame

    constructor(
        geometry: BufferGeometry,
        material: PointsMaterial,
        dataframe: DataFrame) {
        super(geometry, material)
        this.dataframe = dataframe
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

/**
 * ## SkinConfiguration
 * 
 * The properties of this class are shared by every skin modules 
 * of this library.
 * 
 */
@Schema({
    pack
})
export class SkinConfiguration extends FluxThree.Schemas.Object3DConfiguration {

    static defaultCode = `
/*
*/
return (df, helpers) => df.series.A
`

    /**
     * The observableFunction is a function that map a line of 
     * a [[KeplerMesh.dataframe]] to the quantity of interest to observe.
     * 
     * Each line of the dataframe correspond to some properties available 
     * for a particular vertex. The dimension of the quantity to observe 
     * depends on the skin used: for most of them it is a scalar (e.g. for [[ModuleIsoContours]]),
     * but there can be cases (e.g. streamlines with 3D vector expected) where
     * another dimension is expected.
     * 
     * An example of observable function for a [[KeplerMesh]] associated to 
     * a dataframe including a column 'data' would be :
     * ```js
     * return (dataframe, helpers) => {
     *      // This implementation provides the column 'data' as observable 
     *      // quantity to the skin
     *      return dataframe.series.data
     * }
     * ```
     * 
     * The dataframe argument is the dataframe of the Kepler object,
     * helpers contains a collection of algorithms to transform dataframe's
     * series.
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

    getObservableSerie(dataframe: DataFrame, expectedItemSize: number): Serie<IArray> {

        let obsFunction = this.getObservableFunction()
        let obsSerie = obsFunction(dataframe, {})

        if(! (obsSerie instanceof Serie) ) {
            throw new Error("The result of the observable function should be a serie.")
        }
        if( obsSerie.itemSize != expectedItemSize ){
            throw new Error(`The itemSize of the observable serie should be ${expectedItemSize}.`)
        }   
        return obsSerie 
    }

    constructor({ observableFunction, ...others }: { observableFunction?: string | ((DataFrame, any) => Serie<IArray>), others?: any } = {}) {
        super(others as any)
        this.observableFunction = observableFunction != undefined
            ? observableFunction
            : SkinConfiguration.defaultCode

    }
}
