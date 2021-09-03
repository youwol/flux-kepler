import { Context, BuilderView, Flux, Schema, ModuleFlux, Pipe, Property
} from '@youwol/flux-core'

import{pack} from './main'
import { array, Serie } from '@youwol/dataframe'
import { createFluxThreeObject3D } from '@youwol/flux-three'
import { BufferGeometry, Color, Float32BufferAttribute, Group, Object3D, Points, PointsMaterial } from 'three'
import { KeplerPoints, LookUpTables, SkinConfiguration } from './models'
import { ColorMap } from './color-map'
import { svgSkinIcon } from './icons'
import { keplerObjectsExpectation } from './utils'


/**
  ## Presentation

    Create an iso-contours skin from [[KeplerPoints | Kepler Points]] object(s).


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
export namespace ModulePointsSkin{

   

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
         * Points size. Default to 5.
         */
        @Property({
            description: "Points size. Default to 5",
        })
        public readonly pointSize      : number = 5

                
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

        constructor({pointSize, count, lut, ...others} : {
            pointSize?: number, count?:number, lut?:string, others?:any} = {}) {
            super( {
                ...others,
                ...{ 
                    objectId: others['objectId'] ?  others['objectId']: 'PointsSkin',
                    objectName: others['objectName'] ?  others['objectName']: 'PointsSkin'
                }
            })

            const filtered = Object.entries({ count, lut, pointSize})
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
        namespace: ModulePointsSkin,
        id: "ModulePointsSkin",
        displayName: "Points Set Skin",
        description: "Create skin from Kepler's point set",
        resources: {
            //'technical doc': `${pack.urlCDN}/dist/docs/modules/lib_iso_contours_module.moduleisocontours.html`
        }
    })
    @BuilderView({
        namespace: ModulePointsSkin,
        icon: svgSkinIcon
    })
    export class Module extends ModuleFlux {

        
        output$ : Pipe<Object3D>

        constructor( params ){
            super(params)

            this.addInput({
                id:'input',
                description: 'Create the iso-contours skin from input objects',
                contract:  keplerObjectsExpectation("KeplerPoints",['object', 'points'], KeplerPoints),
                onTriggered: ({data, configuration, context}) => this.createSkin(data, configuration, context)
            })
            this.output$ = this.addOutput({id:'output'})
        }

        
        createSkin( pointsSets: KeplerPoints[], configuration: PersistentData, context: Context ) {

            let skins = pointsSets.map( (pointsSet: KeplerPoints, i: number) => {
                return context.withChild(
                    `create skin ${i}`,
                    (ctx) => {
                        let dataframe = pointsSet.dataframe
                        ctx.info("Input Dataframe", dataframe)
                        let obsSerie = configuration.getObservableSerie(dataframe, 1)
                        
                        ctx.info("Observation serie", obsSerie)

                        const material = new PointsMaterial( { size: configuration.pointSize, vertexColors: true, sizeAttenuation:false } );
                        let skin = createPointsSkin(pointsSet, obsSerie, configuration, material)
                        ctx.info("Geometry", skin.geometry)
                        ctx.info("Skin created", skin)
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
    
    export function createPointsSkin(
        pointsSets: KeplerPoints, 
        obsSerie: Serie, 
        configuration: {lut: string, count: number},
        material: PointsMaterial
        ): Points{
        
        let [min, max] = array.minMax(obsSerie.array)
        let lut = new ColorMap(configuration.lut, configuration.count)
        lut.setMin(min)
        lut.setMax(max)
        
        let colors = obsSerie.map( (value:number) => {
            let color = lut.getColor(value)
            return color ? [color.r, color.g, color.b] : [0,0,0]
        })
        let geometry = new BufferGeometry()
        geometry.setAttribute('position', pointsSets.geometry.getAttribute('position'))
        geometry.setAttribute( 'color', new Float32BufferAttribute( colors.array, 3 ) );
        geometry.computeBoundingSphere()

		return new Points( geometry, material );
    }
}