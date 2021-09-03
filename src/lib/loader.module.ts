import { Context, BuilderView, Flux, Schema, ModuleFlux, Pipe, expectInstanceOf, ModuleError
} from '@youwol/flux-core'

import {decodeGocadTS, decodeXYZ} from '@youwol/io'

import * as FluxThree from '@youwol/flux-three'
import * as FluxFiles from '@youwol/flux-files'
import{pack} from './main'
import { map } from 'rxjs/operators'
import { DataFrame } from '@youwol/dataframe'
import { createKeplerMesh, createKeplerPoints } from './kepler'
import { createFluxThreeObject3D } from '@youwol/flux-three'
import { Group, Object3D } from 'three'

/**
  ## Presentation

    Import module to create Kepler 3D objects from various sources.

 ## Resources

 Various resources:
 -    [kepler](https://github.com/youwol/kepler): the kepler library
 -    [io](https://github.com/youwol/io): library used to parse data files
 */
export namespace ModuleLoader{

    let svgIcon = `
<g xmlns="http://www.w3.org/2000/svg">
<g><g>
<path d="M434,331H78c-43.01,0-78,34.99-78,78s34.99,78,78,78h356c43.01,0,78-34.99,78-78S477.01,331,434,331z M434,447H78     c-20.953,0-38-17.047-38-38s17.047-38,38-38h356c20.953,0,38,17.047,38,38S454.953,447,434,447z"/>
<path d="M241.857,295.143c7.717,7.717,20.444,7.841,28.285,0l80-80c7.811-7.81,7.81-20.474,0-28.285     c-7.81-7.811-20.474-7.811-28.285,0L276,232.716V45c0-11.046-8.954-20-20-20s-20,8.954-20,20v187.716l-45.858-45.858     c-7.81-7.811-20.474-7.81-28.285,0c-7.811,7.81-7.811,20.474,0,28.285L241.857,295.143z"/>
</g></g>
</g>
`

    /**
     * ## Persistent Data  🔧
     *
     *
     */
    @Schema({
        pack
    })
    export class PersistentData extends FluxThree.Schemas.SimpleObject3DConfiguration{
       
        constructor(forwardParams) {
            super({
                ...forwardParams,
                ...{ 
                    objectId: forwardParams && forwardParams['objectId'] ?  forwardParams['objectId']: 'Loaded',
                    objectName: forwardParams && forwardParams['objectName'] ?  forwardParams['objectName']: 'Loaded'
                }
            })
        }
    }

    
    export let fileExpectation = expectInstanceOf<FluxFiles.Interfaces.File>({
        typeName:'File', Type:FluxFiles.Interfaces.File, attNames:['file', 'data']
    })


    /** ## Module
     * 
     */
    @Flux({
        pack: pack,
        namespace: ModuleLoader,
        id: "ModuleLoader",
        displayName: "Loader",
        description: "Creates kepler 3D object(s) from various sources",
        resources: {
            'technical doc': `${pack.urlCDN}/dist/docs/modules/lib_module_loader_module.moduleloader.html`
        }
    })
    @BuilderView({
        namespace: ModuleLoader,
        icon: svgIcon
    })
    export class Module extends ModuleFlux {

        static decoders : {[key:string]: (string)=> DataFrame[] } = {
            '.ts': (buffer: string) => decodeGocadTS(buffer),
            '.xyz': (buffer: string) => decodeXYZ(buffer)
        }
        
        /**
         * This is the output, you can use it to emit messages using *this.result$.next(...)*.
         *
         */
        output$ : Pipe<Object3D>

        constructor( params ){
            super(params)

            this.addInput({
                id:'input',
                description: 'load from a file (.ts)',
                contract:  fileExpectation,
                onTriggered: ({data, configuration, context}) => this.loadFile(data, configuration, context)
            })
            this.output$ = this.addOutput({id:'output'})
        }

        /**
        * Processing function triggered when a message is received
        */
         loadFile( file: FluxFiles.Interfaces.File, configuration: PersistentData, context: Context ) {

            let extensions = Object.keys(Module.decoders)
            if( extensions
                .map( (ext) => file.name.endsWith(ext))
                .filter( ok=>ok).length != 1 ) {

                throw new ModuleError(this,`Only extensions [${extensions}] are supported (filename=${file.name})`)
            }

            let ext = '.'+file.name.split('.').slice(-1)[0]

            let decoder = Module.decoders[ext]

            file.readAsText().pipe(
                map( (buffer) => {
                    return context.withChild(
                        'decode text buffer',
                        (ctx) => this.decodeBuffer(buffer, decoder, ctx) 
                        )
                }),
                map( (dfs: DataFrame[]) => {
                    return context.withChild(
                        'create kepler object(s) from dataframe(s)',
                        (ctx) => this.createObjectFromDfs(dfs, configuration, ctx) 
                        )
                })
            ).subscribe( (d) => {
                this.output$.next({data:d, context})
                context.terminate()
            } )
        }

        decodeBuffer( buffer: string, decoder: (string)=>DataFrame[], context: Context ) {
            return decoder(buffer)
        }

        createObjectFromDfs(dfs: DataFrame[], configuration: PersistentData, context: Context){
            
            let meshes = dfs.map( (df: DataFrame, i:number) => {
                return context.withChild(
                    `create surface ${i}`,
                    (ctx) => {
                        let suffix = dfs.length>1 ? `_${i}` : ""
                        let obj = df.series.indices 
                            ? createKeplerMesh(df, ctx)
                            : createKeplerPoints(df, ctx)
                        
                        context.info("Object created", obj)  
                        df.userData.name = configuration.objectId + suffix
                        return createFluxThreeObject3D({
                            object:obj,
                            id:configuration.objectId + suffix,
                            displayName:configuration.objectName + suffix
                        })
                    })
            })
            let group = new Group() 
            meshes.forEach( (mesh) => {
                group.add(mesh)
            })

            return createFluxThreeObject3D({
                object:group,
                id:configuration.objectId,
                displayName:configuration.objectId
            })
        }
    }

}