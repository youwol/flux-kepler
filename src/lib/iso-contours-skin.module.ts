import { Context, BuilderView, Flux, Schema, ModuleFlux, Pipe, Property} from '@youwol/flux-core'

import{pack} from './main'
import { array, Serie } from '@youwol/dataframe'
import { createFluxThreeObject3D } from '@youwol/flux-three'
import { DoubleSide, Group, MeshStandardMaterial, Object3D } from 'three'
import { KeplerMesh, LookUpTables, SkinConfiguration } from './models'
import {createIsoContours, generateIsos, IsoContoursParameters} from '@youwol/kepler'
import { svgSkinIcon } from './icons'
import { keplerObjectsExpectation } from './utils'


/**
  ## Presentation

    Create an iso-contours skin from [[KeplerMesh | Kepler]] object(s).

<div style="max-width:100%; overflow:auto">
    <div style="display:flex; width:250%; margin:auto">
        <figure style="text-align: center; font-style: italic;">
            <img src="https://raw.githubusercontent.com/youwol/flux-kepler/master/images/screenshots/iso-contours.png" 
             alt="" >
            <figcaption >An example of iso-contours skin
            </figcaption>
        </figure>
    </div>
</div>

    Various parameters can be provided through the configuration to customize the skin,
    see [[ModuleIsoContours.PersistentData]].

 ## Usage in Flux
 
  This module is usually plugged after a module emitting a [[KeplerMesh]] in one of 
  his output. It can be for instance [[ModuleLoader]]. 

  Various display options are exposed through the module's configuration, see [[ModuleIsoContours.PersistentData]].
  Some properties are common to every skins, see [[SkinConfiguration]].

  The actual attribute - a scalar - displays by the skin is controlled by 
  [[SkinConfiguration.observableFunction]]
 
 ## Technical details

 
 Various resources:
 -    [kepler](https://github.com/youwol/kepler): the kepler library, used to generate the iso-contour skin
 -    [io](https://github.com/youwol/io): library used to parse data files
 */
export namespace ModuleIsoContours{

    export function getIsoValues(serie: Serie, limitNormalized1: number, limitNormalized2: number, count: number){

        let minNormalized = Math.min(limitNormalized1, limitNormalized2)
        let maxNormalized = Math.max(limitNormalized1, limitNormalized2)
        const minmax = array.minMax(serie.array)
        let min = minmax[0] + (minmax[1] - minmax[0]) * minNormalized
        let max = minmax[0] + (minmax[1] - minmax[0]) * maxNormalized
        return { min, max, values: generateIsos(min, max, count) }
    }



    /**
     * ## Persistent Data  🔧
     *
     * The properties of this class are the parameters that can be 
     * configured statically and persisted through the editor panel of the   
     * module.
     * 
     * > 🕵️‍♀️ Most of the attributes are quite straightforward to understand, the 
     * > attribute [[SkinConfiguration.observableFunction]] is important to understand. 
     */
    @Schema({
        pack
    })
    export class PersistentData extends SkinConfiguration {
       
        /**
         * Whether or not to fill between iso contours. Default to true.
         */
        @Property({
            description: "Whether or not to fill in-between iso contours. Default to true.",
        })
        public readonly filled     : boolean = true

        /**
         * Iso contours count. Default to 10.
         */
        @Property({
            description: "Iso contours count. Default to 10",
        })
        public readonly count      : number = 10

        /**
         * Look up table, default to Rainbow
         */
         @Property({
            description: "Look up table, default to Rainbow",
            enum: LookUpTables
        })
        public readonly lut        : string = 'Rainbow'


        public readonly lockLut    : boolean = true
        public readonly reversedLut: boolean
        public readonly min        : number = 0
        public readonly max        : number = 1

        constructor({filled, count, lut, ...others} : {
            filled?:boolean, count?:number, lut?:string, others?:any} = {}) {
            super( {
                ...others,
                ...{ 
                    objectId: others['objectId'] ?  others['objectId']: 'Contours',
                    objectName: others['objectName'] ?  others['objectName']: 'Contours'
                }
            })

            const filtered = Object.entries({filled, count, lut})
            .filter( ([k,v]) => v != undefined)
            .reduce((acc, [k,v]) => ({...acc, ...{[k]: v}}), {});

            Object.assign(this, filtered)
        }
    }


    /** ## Module
     * 
     */
    @Flux({
        pack: pack,
        namespace: ModuleIsoContours,
        id: "ModuleIsoContours",
        displayName: "IsoContours",
        description: "Create iso-contours skin from Kepler object(s)",
        resources: {
            'technical doc': `${pack.urlCDN}/dist/docs/modules/lib_iso_contours_module.moduleisocontours.html`
        }
    })
    @BuilderView({
        namespace: ModuleIsoContours,
        icon: svgSkinIcon
    })
    export class Module extends ModuleFlux {

        
        output$ : Pipe<Object3D>

        constructor( params ){
            super(params)

            this.addInput({
                id:'input',
                description: 'Create the iso-contours skin from input objects',
                contract:  keplerObjectsExpectation("KeplerMesh",['object', 'mesh'], KeplerMesh),
                onTriggered: ({data, configuration, context}) => this.createIsoContours(data, configuration, context)
            })
            this.output$ = this.addOutput({id:'output'})
        }

        
        createIsoContours( meshes: KeplerMesh[], configuration: PersistentData, context: Context ) {

            let skins = meshes.map( (mesh: KeplerMesh, i: number) => {
                return context.withChild(
                    `create skin ${i}`,
                    (ctx) => {
                        ctx.info("Input Dataframe", mesh.dataframe)
                        let obsFunction = configuration.getObservableFunction()
                        let obsSerie = obsFunction(mesh.dataframe, {})
                        if(! (obsSerie instanceof Serie) ) {
                            throw new Error("The result of the observable function should be a serie.")
                        }
                        if( obsSerie.itemSize != 1 ){
                            throw new Error("The itemSize of the observable serie should be one (i.e. a scalar).")
                        }                        
                        ctx.info("Observation serie", obsSerie)
                        let {min, max, values} = getIsoValues(obsSerie,configuration.min, configuration.max, configuration.count)
                        let parameters = new IsoContoursParameters({
                            filled:configuration.filled,
                            isoList: values,
                            min: min,
                            max: max,
                            lut: configuration.lut
                        })
                        let material =  new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, side:DoubleSide })
                        let skin = createIsoContours(mesh,obsSerie,{parameters, material})
                        ctx.info("Contours created")
                        ctx.info("Geometry", skin.geometry )
                        ctx.info("Mesh", skin )
                        return skin
                    })
            })
            let group = new Group() 
            skins.forEach( (skin) => {
                group.add(skin)
            })
            let obj = createFluxThreeObject3D({
                object:group,
                id:configuration.objectId,
                displayName:configuration.objectId,
                transform: configuration.transform
            })

            this.output$.next({data:obj, context})
            context.terminate()
        }
    }
}