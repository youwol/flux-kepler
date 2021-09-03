import { Context, BuilderView, Flux, Schema, ModuleFlux, Pipe, Property} from '@youwol/flux-core'

import{pack} from './main'
import { array, IArray, Serie } from '@youwol/dataframe'
import { createFluxThreeObject3D } from '@youwol/flux-three'
import { BoxGeometry, DoubleSide, Group, MeshStandardMaterial, Object3D } from 'three'
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



        /**
         * Deformation function, only used if scaling factor is not zero
         */
         @Property({
            description: " Deformation function",
            type:"code"
        })
        public readonly deformObservableFct : string | ((DataFrame, any) => Serie<IArray>)
        = `/* This is just an example that works only if the serie A is in the dataframe */
        return (df, helpers) => df.series.A
        `

        getDeformObservableFunction(): (DataFrame, any) => Serie<IArray> {

            if (typeof (this.deformObservableFct) == 'string')
                return new Function(this.deformObservableFct)()
    
            return this.deformObservableFct
        }

        /**
         * Scaling factor
         */
         @Property({
            description: "Deformation scaling factor"
        })
        public readonly deformScalingFactor : number = 0


        public readonly lockLut    : boolean = true
        public readonly reversedLut: boolean
        public readonly min        : number = 0
        public readonly max        : number = 1

        constructor({filled, count, lut, deformObservableFct, deformScalingFactor, ...others} : {
            filled?:boolean, count?:number, lut?:string, deformObservableFct?: string, deformScalingFactor?: number, others?:any} = {}) {
            super( {
                ...others,
                ...{ 
                    objectId: others['objectId'] ?  others['objectId']: 'Contours',
                    objectName: others['objectName'] ?  others['objectName']: 'Contours'
                }
            })
            
            const filtered = Object.entries({filled, count, lut, deformObservableFct, deformScalingFactor})
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

        
        createIsoContours( meshes: any, configuration: PersistentData, context: Context ) {

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
                        let meshDeformed = deformMesh(mesh, configuration, ctx)
                        let skin = createIsoContours(meshDeformed,obsSerie,{parameters, material})
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

    /**
     * From the provided mesh, return a new version deformed according to the parameters in the 
     * configuration
     * 
     * @param rawMesh 
     * @param configuration 
     */
    function deformMesh(rawMesh: KeplerMesh, configuration: PersistentData, context: Context){

        return context.withChild(
            `apply deformation`,
            (ctx) => {
                if(configuration.deformScalingFactor==0){
                    ctx.info("Scaling deform factor = 0 => no deformation applied")
                    return rawMesh
                }
                let dataframe = rawMesh.dataframe
                let obsFunction = configuration.getDeformObservableFunction()
                let obsSerie = obsFunction(dataframe, {})
                ctx.info("Scaling deform factor = 0 => no deformation applied")
                ctx.info("Displacement serie", obsSerie)

                if( obsSerie.itemSize != 3 ){
                    throw new Error("The itemSize of the observable serie for deformation should be 3 (i.e. a 3D vector).")
                }   
                let factor = configuration.deformScalingFactor

                let displacements = obsSerie.map( ([x,y,z]) => {
                    return [factor*x, factor*y, factor*z]
                })
                let geometry = rawMesh.geometry.clone()
                let positions = geometry.getAttribute('position')
                for(let iVertex=0; iVertex<positions.count; iVertex++) {
                    let displacement = displacements.itemAt(iVertex)
                    positions.setX(iVertex,positions.getX(iVertex) + displacement[0])
                    positions.setY(iVertex,positions.getY(iVertex) + displacement[1])
                    positions.setZ(iVertex,positions.getZ(iVertex) + displacement[2])
                }
                let mesh = new KeplerMesh(geometry, rawMesh.material, dataframe)
                return mesh
            })
        
    }
}