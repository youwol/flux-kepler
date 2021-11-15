import { Context, BuilderView, Flux, Schema, ModuleFlux, Pipe, Property } from '@youwol/flux-core'

import { pack } from './main'
import { BufferAttribute, BufferGeometry, Color, Group, LineBasicMaterial, LineSegments, Mesh, Object3D } from 'three'
import { svgSkinIcon } from './icons'
import { keplerObjectsExpectation } from './utils'

import * as FluxThree from '@youwol/flux-three'
import { fetchJavascriptAddOn } from '@youwol/cdn-client'
import { createFluxThreeObject3D } from '@youwol/flux-three'

/**
  ## Presentation

  Create a 3D lines set from the borders of a 3D object
 */
export namespace ModuleBorders {

    interface ModuleWASM {
        borders(vertices: ArrayLike<number>, triangles: ArrayLike<number>): ArrayLike<number>
    }
    /**
     * ## Persistent Data  🔧
     *
     * The properties of this class are the parameters that can be 
     * configured statically and persisted through the editor panel of the   
     * module.
     */
    @Schema({
        pack
    })
    export class PersistentData extends FluxThree.Schemas.Object3DConfiguration {


        @Property({
            description: "Thickness of the lines.",
        })
        public readonly lineWidth: number = 1

        @Property({
            description: "color of the line",
            type: 'color'
        })
        public readonly color: string = "#000000"


        constructor(params: { lineWidth?: number, color?: string } = {}) {
            super({
                objectId: 'Borders',
                objectName: 'Borders',
                ...params,
            })
            Object.assign(this, params)
        }
    }


    /** ## Module
     * 
     */
    @Flux({
        pack: pack,
        namespace: ModuleBorders,
        id: "ModuleBorders",
        displayName: "Borders",
        description: "Create borders object from mesh",
        resources: {
            'technical doc': `${pack.urlCDN}/dist/docs/modules/lib_borders_skin_module.moduleborders.html`
        }
    })
    @BuilderView({
        namespace: ModuleBorders,
        icon: svgSkinIcon
    })
    export class Module extends ModuleFlux {

        static boundaries$: Promise<ModuleWASM>

        output$: Pipe<Object3D>

        constructor(params) {
            super(params)

            this.addInput({
                id: 'input',
                description: 'Create the boundaries from input objects',
                contract: keplerObjectsExpectation("Mesh", ['object', 'mesh'], Mesh),
                onTriggered: ({ data, configuration, context }) => this.createBorders(data, configuration, context)
            })
            this.output$ = this.addOutput({ id: 'output' })
            if (!Module.boundaries$) {
                Module.boundaries$ = fetchJavascriptAddOn([
                    `@youwol/flux-kepler#${pack.version}~assets/boundaries.js`
                ]).then(() => window['MeshModule']())
            }
        }


        createBorders(meshes: Array<Mesh>, configuration: PersistentData, context: Context) {

            Module.boundaries$.then((moduleWASM: ModuleWASM) => {
                context.info("Wasm module loaded, proceed to computations")

                let skins = meshes.map((mesh: Mesh, i: number) => {
                    return context.withChild(
                        `create boundaries skin ${i}`,
                        (ctx) => {
                            ctx.info("lines created")
                            return createFluxThreeObject3D({
                                object: createBorders(mesh, configuration, moduleWASM),
                                id: `${configuration.objectId}_${i}`,
                                displayName: `${configuration.objectId}_${i}`,
                                transform: configuration.transform
                            })
                        })
                })
                let group = new Group()
                skins.forEach((skin) => {
                    group.add(skin)
                })
                let obj = createFluxThreeObject3D({
                    object: group,
                    id: configuration.objectId,
                    displayName: configuration.objectId,
                    transform: configuration.transform
                })

                this.output$.next({ data: obj, context })
                context.terminate()
            })
        }
    }

    function createBorders(mesh: Mesh, configuration: PersistentData, wasm: ModuleWASM): LineSegments {

        const vertices = mesh.geometry.getAttribute('position')
        const triangles = mesh.geometry.index

        const borders = wasm.borders(vertices.array, triangles.array)

        const indices = []
        let id = 0
        for (let i = 0; i < borders.length / 6; ++i) {
            indices.push(id++, id++)
        }

        const geometry = new BufferGeometry()
        geometry.setAttribute('position', new BufferAttribute(new Float32Array(borders), 3))
        geometry.setIndex(indices)

        const material = new LineBasicMaterial({
            linewidth: configuration.lineWidth,
            color: new Color(configuration.color)
        })

        return new LineSegments(geometry, material)
    }

}
