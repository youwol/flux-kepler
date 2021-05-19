import { DataFrame, IArray, Serie } from "@youwol/dataframe";
import { Property, Schema } from "@youwol/flux-core";
import { Mesh } from "three";
import {pack} from './main'

import * as FluxThree from '@youwol/flux-three'


export class KeplerMesh extends Mesh{

    constructor( public readonly mesh:Mesh, public readonly dataframe: DataFrame ){
        super(mesh.geometry, mesh.material)
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
    @Property({
      description: "DataFrame to target attribute mapping function",
      type: "code"
    })
    readonly observableFunction: string | ( (DataFrame, any)=>Serie<IArray> )

    getObservableFunction(): (DataFrame, any)=>Serie<IArray>{

        if(typeof(this.observableFunction) == 'string')
            return new Function(this.observableFunction)()

        return this.observableFunction
    }

    constructor({observableFunction, ...others} : {observableFunction?: string | ((DataFrame, any)=>Serie<IArray>), others?:any} = {}) {
      super( others as any)
      this.observableFunction = observableFunction != undefined 
        ? observableFunction 
        : SkinConfiguration.defaultCode

    }
  }
  