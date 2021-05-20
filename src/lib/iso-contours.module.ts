import { Context, BuilderView, Flux, Schema, ModuleFlux, Pipe, expect, expectInstanceOf, contract, ModuleError, expectAnyOf, expectAllOf, Property
} from '@youwol/flux-core'

import{pack} from './main'
import { Serie } from '@youwol/dataframe'
import { createFluxThreeObject3D } from '@youwol/flux-three'
import { DoubleSide, Group, MeshStandardMaterial, Object3D } from 'three'
import { KeplerMesh, LookUpTables, SkinConfiguration } from './models'
import {createIsoContours, IsoContoursParameters} from '@youwol/kepler'
/**
  ## Presentation

    Create iso-contours skin from Kepler object(s)

 ## Resources

 Various resources:
 -    [kepler](https://github.com/youwol/kepler): the kepler library
 -    [io](https://github.com/youwol/io): library used to parse data files
 */
export namespace ModuleIsoContours{

//Icons made by <a href="https://www.flaticon.com/authors/wissawa-khamsriwath" title="Wissawa Khamsriwath">Wissawa Khamsriwath</a> from <a href="https://www.flaticon.com/" title="Flaticon"> www.flaticon.com</a>
    let svgIcon = `
<g xmlns="http://www.w3.org/2000/svg">
    <g id="XMLID_19_">
        <g>
            <path style="fill:#EAEEEF;" d="M270.778,160.786c-5.287,39.859-29.157,76.642-67.414,96.635      c-38.257,19.961-82.089,18.584-117.814,0.16c30.855-0.481,66.997-9.997,102.883-28.741S252.739,185.842,270.778,160.786z"/>
            <path style="fill:#EAEEEF;" d="M237.039,56.461c0.32,33.611-33.547,76.898-84.556,103.588      c-51.073,26.658-105.959,29.702-133.354,10.157c-2.211-10.734-3.044-21.596-2.499-32.297      c35.085,9.965,77.539,5.831,116.661-14.611c39.09-20.442,66.741-52.899,78.596-87.407      C221.019,41.594,229.478,48.483,237.039,56.461z"/>
            <path style="fill:#EAEEEF;" d="M140.853,16.506c-11.15,15.251-25.857,28.26-43.736,37.616      C79.27,63.446,60.174,68.06,41.27,68.508C52.452,53.257,67.159,40.28,85.038,30.956C102.885,21.6,121.981,16.955,140.853,16.506      z"/>
            <path style="fill:#FEDE94;" d="M257.417,85.009c7.017,13.457,11.407,27.619,13.329,41.845      c-12.24,30.407-45.402,64.146-89.939,87.407c-44.505,23.262-91.156,31.208-123.101,23.934      c-10.606-9.708-19.705-21.403-26.754-34.86c-1.826-3.492-3.46-7.081-4.934-10.67c34.123,13.361,84.62,7.786,134.059-18.071      c49.022-25.601,82.377-63.441,91.284-98.814c-0.673-1.442-1.442-2.916-2.211-4.358      C252.131,75.717,254.918,80.235,257.417,85.009z"/>
            <path style="fill:#FEDE94;" d="M197.277,28.073c-9.933,31.496-35.309,61.711-71.611,80.647      c-36.302,18.968-75.584,22.525-107.112,12.688c2.339-12.752,6.568-25.088,12.592-36.623      c24.736,1.218,50.112-3.813,73.598-16.084c23.486-12.304,42.102-30.214,55.238-51.233      C172.862,19.101,185.454,22.69,197.277,28.073z"/>
            <path style="fill:#2D213F;" d="M271.996,77.384c36.815,70.49,9.452,157.769-61.038,194.616      c-70.458,36.815-157.769,9.42-194.584-61.038c-36.815-70.49-9.452-157.769,61.038-194.584      C147.87-20.437,235.181,6.926,271.996,77.384z M270.746,126.855c-1.922-14.226-6.312-28.388-13.329-41.845      c-2.499-4.774-5.287-9.292-8.267-13.585c0.769,1.442,1.538,2.916,2.211,4.358c-8.907,35.373-42.262,73.213-91.284,98.814      c-49.439,25.857-99.935,31.432-134.059,18.071c1.474,3.589,3.108,7.177,4.934,10.67c7.049,13.457,16.149,25.152,26.754,34.86      c31.945,7.273,78.596-0.673,123.101-23.934C225.345,191,258.507,157.261,270.746,126.855z M203.365,257.421      c38.257-19.993,62.127-56.776,67.414-96.635c-18.039,25.056-46.459,49.311-82.345,68.055S116.406,257.1,85.55,257.581      C121.276,276.005,165.108,277.382,203.365,257.421z M152.484,160.049c51.009-26.69,84.876-69.977,84.556-103.588      c-7.562-7.978-16.02-14.867-25.152-20.57c-11.855,34.508-39.506,66.965-78.596,87.407      C94.17,143.74,51.716,147.873,16.631,137.909c-0.545,10.702,0.288,21.563,2.499,32.297      C46.525,189.751,101.411,186.707,152.484,160.049z M125.666,108.719c36.302-18.936,61.679-49.151,71.611-80.647      c-11.823-5.383-24.415-8.971-37.296-10.606c-13.137,21.019-31.752,38.93-55.238,51.233      C81.257,80.972,55.881,86.003,31.145,84.785c-6.024,11.535-10.253,23.87-12.592,36.623      C50.081,131.244,89.363,127.688,125.666,108.719z M97.117,54.122c17.879-9.356,32.586-22.364,43.736-37.616      c-18.872,0.449-37.968,5.094-55.815,14.45c-17.879,9.324-32.586,22.3-43.768,37.552C60.174,68.06,79.27,63.446,97.117,54.122z"/>
        </g>
    </g>
    <path style="fill:#F4CE6E;" d="M27.079,93.34c-3.893,9.007-6.757,18.417-8.526,28.068c6.597,2.057,13.55,3.492,20.727,4.361    C34.276,114.471,30.274,103.519,27.079,93.34z"/>
    <path style="fill:#C5CBCF;" d="M73.327,182.596c-10.275-12.928-18.763-26.398-25.774-39.731    c-10.724-0.535-21.115-2.176-30.919-4.96c-0.545,10.702,0.288,21.563,2.499,32.297C32.119,179.469,51.321,183.592,73.327,182.596z    "/>
    <path style="fill:#F4CE6E;" d="M57.707,238.196c20.083,4.572,45.985,3.121,73.508-4.364    c-17.078-10.352-31.682-22.438-44.143-35.469c-22.976,2.913-44.05,0.964-61.054-5.694c1.474,3.589,3.108,7.177,4.934,10.67    C38.002,216.793,47.101,228.488,57.707,238.196z"/>
    <path style="fill:#C5CBCF;" d="M151.744,244.816c-23.297,8.193-45.892,12.448-66.19,12.762    c33.745,17.401,74.713,19.571,111.393,2.941C180.436,256.546,165.409,251.218,151.744,244.816z"/>
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
    export class PersistentData extends SkinConfiguration {
       
        /**
         * Whether or not to fill between iso contours. Default to true.
         */
        @Property({
            description: "Whether or not to fill between iso contours. Default to true.",
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

    
    export let contract = expectAnyOf({
        description:"A KeplerMesh or a group of 3D objects containing KeplerMesh(es)",
        when:[
            expectInstanceOf({ 
                typeName:'KeplerMesh', 
                Type: KeplerMesh, attNames:['object', 'mesh']
            }),
            expectAllOf({
                description:'A group of 3D objects containing KeplerMesh',
                when:[
                    expectInstanceOf({typeName:'Group', Type:Group}),
                    expect({
                        description: 'The group contains KeplerMesh',
                        when: (group:Group) => group.children.find( child => child instanceof KeplerMesh) != undefined,
                        normalizeTo: (group:Group) => group.children.filter( child => child instanceof KeplerMesh) 
                    })
                ],
                normalizeTo: (accData: [Group, KeplerMesh[]]) => accData[1]
            })
        ],
        normalizeTo: (data: KeplerMesh | KeplerMesh[]) => {
            return (Array.isArray(data)) ? data : [data]
        }
    })


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
            'technical doc': `${pack.urlCDN}/dist/docs/modules/lib_module_loader_module.moduleloader.html`
        }
    })
    @BuilderView({
        namespace: ModuleIsoContours,
        icon: svgIcon
    })
    export class Module extends ModuleFlux {

        
        output$ : Pipe<Object3D>

        constructor( params ){
            super(params)

            this.addInput({
                id:'input',
                description: 'load from a file (.ts)',
                contract:  contract,
                onTriggered: ({data, configuration, context}) => this.createIsoContours(data, configuration, context)
            })
            this.output$ = this.addOutput({id:'output'})
        }

        
        createIsoContours( meshes: KeplerMesh[], configuration: PersistentData, context: Context ) {

            console.log("createIsoContours!", meshes)

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
                        //let skin = createIsoContourFilled( mesh, obsSerie, {parameters:configuration} )
                        let parameters = new IsoContoursParameters({
                            filled:configuration.filled,
                            nbr:configuration.count,
                            min: configuration.min,
                            max: configuration.max,
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
                displayName:configuration.objectId
            })

            this.output$.next({data:obj, context})
            context.terminate()
        }
    }

}