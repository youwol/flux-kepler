import * as _ from 'lodash'
import {
    Context, BuilderView, Flux, Schema, expect, expectInstanceOf, expectAnyOf, expectAllOf, PluginFlux
} from '@youwol/flux-core'

import { pack } from './main'
import { map as dfMap } from '@youwol/dataframe'
import { ModuleViewer } from '@youwol/flux-three'
import { BoxHelper, BufferGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, Object3D, Raycaster, Vector2 } from 'three'
import { KeplerMesh, LookUpTables} from './models'
import { createIsoContours, generateIsos, IsoContoursParameters } from '@youwol/kepler'
import { BehaviorSubject, combineLatest, Observable, ReplaySubject, Subscription } from 'rxjs'
import { map, skip, } from 'rxjs/operators'
import { attr$, childrenWithReplace$, render, VirtualDOM } from '@youwol/flux-view'
import { ExpandableGroup} from '@youwol/fv-group'
import { Switch} from '@youwol/fv-button'
import { colorRowView, headerGrpView, integerRow, selectProjection, selectRow, sliderRow, switchRowView } from './views/viewer-widgets.view'
import { ModuleIsoContours } from './iso-contours.module'
/**
 *  ## Presentation
 *
 * This plugin of 3D Viewer (flux-three) allows to dynamically controls skin displays 
 * settings of a [[KeplerMesh]] directly inside a 3D viewer.
 *
 * ## Usage in Flux
 *
 *  Provide the [[KeplerMesh | Kepler objects]] that needs to be controlled dynamically as 
 *  input to this plugin rather to the input of the 3D viewer.
 *
 *
 * ## Technical details
 *
 * The plugin create different 3D objects (different sins) from the input [[KeplerMesh]] that are
 * forwarded to the parent module (3d viewer).
 *
 */
export namespace PluginLiveSkinController {

    let svgIcon = ``
    interface GlobalParams{
        visible$: Observable<boolean>
        opacity$: Observable<number>
    }

    export class WireframeConfiguration {

        lineWidth$: BehaviorSubject<number>
        color$: BehaviorSubject<string>
        activated$: BehaviorSubject<boolean>

        decoration$: Observable<Mesh>

        mesh: Mesh

        constructor(
            { mesh, color, activated, lineWidth, globalParameters$ }:
            { 
                mesh: Mesh, 
                color: string, 
                activated: boolean, 
                lineWidth?: number, 
                globalParameters$: GlobalParams
            }) {

            this.color$ = new BehaviorSubject<string>(color)
            this.activated$ = new BehaviorSubject<boolean>(activated)
            this.lineWidth$ = new BehaviorSubject<number>(lineWidth ? lineWidth : 1)
            this.mesh = mesh

            this.decoration$ = combineLatest([
                this.activated$, this.color$, this.lineWidth$,
                globalParameters$.visible$, globalParameters$.opacity$
            ]).pipe(
                map(([activated, color, lineWidth, visible, opacity]) => {
                    let originalMat = mesh.material as MeshStandardMaterial
                    let mat = new MeshStandardMaterial(
                        {
                            color, 
                            wireframe: true, 
                            flatShading: originalMat.flatShading,
                            transparent: opacity != 1,
                            opacity: opacity,
                            vertexColors: originalMat.vertexColors, 
                            side: DoubleSide, 
                            wireframeLinewidth: lineWidth
                        })
                    mat.visible = activated && visible
                    let decoration = new Mesh(mesh.geometry, mat)
                    decoration.name = mesh.name + "_wireframe"
                    decoration.userData = { ...mesh.userData, ...{ __fromMesh: mesh.name } }
                    return decoration
                })
            )
        }
    }

    export class PaintingConfiguration {

        color$: BehaviorSubject<string>
        activated$: BehaviorSubject<boolean>
        flatShading$: BehaviorSubject<boolean>
        roughness$: BehaviorSubject<number>
        metalness$: BehaviorSubject<number>

        decoration$: Observable<Mesh>

        mesh: Mesh

        constructor({ mesh, color, flatShading, roughness, metalness, activated, globalParameters$ }:
            { 
                mesh: Mesh, 
                color: string,
                activated: boolean, 
                flatShading?: boolean, 
                roughness?: number, 
                metalness?: number, 
                globalParameters$: GlobalParams
            }) {

            let originalMat = mesh.material as MeshStandardMaterial
            this.color$ = new BehaviorSubject<string>(color)
            this.activated$ = new BehaviorSubject<boolean>(activated)
            this.flatShading$ = new BehaviorSubject<boolean>(flatShading != undefined ? flatShading : originalMat.flatShading)
            this.roughness$ = new BehaviorSubject<number>(roughness != undefined ? roughness : originalMat.roughness)
            this.metalness$ = new BehaviorSubject<number>(metalness != undefined ? metalness : originalMat.metalness)
            this.mesh = mesh

            this.decoration$ = combineLatest([
                this.activated$, this.color$, this.flatShading$, this.roughness$, this.metalness$, 
                globalParameters$.visible$, globalParameters$.opacity$
            ]).pipe(
                map(([activated, color, flatShading, roughness, metalness, visible, opacity]: 
                    [boolean, string, boolean, number, number, boolean, number]) => {

                    let originalMat = mesh.material as MeshStandardMaterial
                    let mat = new MeshStandardMaterial(
                        {   color, 
                            wireframe: false, 
                            flatShading: flatShading, 
                            roughness,                             
                            transparent: opacity != 1,
                            opacity: opacity,
                            metalness, 
                            vertexColors: originalMat.vertexColors,
                            side: DoubleSide 
                        })
                    mat.visible = activated && visible
                    let decoration = new Mesh(mesh.geometry, mat)
                    decoration.name = mesh.name + "_painting"
                    decoration.userData = { ...mesh.userData, ...{ __fromMesh: mesh.name } }
                    return decoration
                })
            )
        }
    }

    export class ShadingSkinConfiguration {

        lutNames = LookUpTables
        paintingNames = ["step", "smooth"]

        activated$: BehaviorSubject<boolean>
        lut$: BehaviorSubject<string>
        min$: BehaviorSubject<number>
        max$: BehaviorSubject<number>
        column$: BehaviorSubject<string>
        columnNames: Array<string>
        projection$: BehaviorSubject<[string, string, (any) => number]>
        projectionNames$: Observable<Array<string>>
        linesCount$: BehaviorSubject<number>
        isoLines$: BehaviorSubject<boolean>
        shading$: BehaviorSubject<boolean>
        paintingMode$: BehaviorSubject<string>

        mesh: KeplerMesh
        decoration$: Observable<Object3D>

        static projectionDict_1D = {
            value: (d) => d
        }

        static projectionDict_3D = {
            x: (d) => d[0],
            y: (d) => d[1],
            z: (d) => d[1],
            norm: (d) => Math.sqrt(d.reduce((acc, e) => acc + e * e, 0)),
        }
        static projectionDict_6D = {
            xx: (d) => d[0],
            xy: (d) => d[1],
            xz: (d) => d[2],
            yy: (d) => d[3],
            yz: (d) => d[4],
            zz: (d) => d[5],
            norm: (d) => Math.sqrt(d.reduce((acc, e) => acc + e * e, 0)),
            //eigen0: (d) => eigen(d).vectors[0], eigen1: (d) => eigen(d).vectors[1], eigen2: (d) => eigen(d).vectors[2],
        }

        constructor({ mesh, lut, min, max, column, projection, linesCount, isoLines, shading, 
            paintingMode, activated, globalParameters$ }:
            {
                mesh: KeplerMesh, 
                lut?: string, 
                min?: number, 
                max?: number, 
                column?: string,
                projection?: string, 
                linesCount?: number, 
                isoLines?: boolean, 
                shading?: boolean,
                paintingMode?: string, 
                activated: boolean,
                globalParameters$: GlobalParams
            }) {

            this.lut$ = new BehaviorSubject<string>(lut != undefined ? lut : this.lutNames[0])
            this.activated$ = new BehaviorSubject<boolean>(activated)
            this.min$ = new BehaviorSubject<number>(min != undefined ? min : 0)
            this.max$ = new BehaviorSubject<number>(max != undefined ? max : 1)

            column = column != undefined ? column : Object.keys(mesh.dataframe.series)[0]
            this.column$ = new BehaviorSubject<string>(column)
            this.linesCount$ = new BehaviorSubject<number>(linesCount != undefined ? linesCount : 25)
            this.isoLines$ = new BehaviorSubject<boolean>(isoLines != undefined ? isoLines : true)
            this.shading$ = new BehaviorSubject<boolean>(shading != undefined ? shading : true)
            this.paintingMode$ = new BehaviorSubject<string>(paintingMode != undefined ? paintingMode : "step")
            //this.observableFct$ = new BehaviorSubject<(any) => number>(observableFct != undefined ? observableFct : (d) => d)

            this.mesh = mesh

            let defaultProjection = Object.entries(this.getProjections(column))[0]
            this.projection$ = new BehaviorSubject<[string, string, (any) => number]>([column, ...defaultProjection])

            this.decoration$ = combineLatest([
                this.activated$, this.lut$, this.min$, this.max$, this.column$,
                this.projection$, this.linesCount$, this.isoLines$, this.shading$, 
                this.paintingMode$, globalParameters$.visible$, globalParameters$.opacity$
            ]).pipe(
                map(([activated, lut, min, max, column, projection, linesCount, isoLines, shading, paintingMode, 
                    visible, opacity]:
                    [boolean, string, number, number, string, [string, string, (any) => number], number, boolean, 
                    boolean, string, boolean, number]) => {

                    let observableFct = projection[2] 
                    let obsValues = this.getObsValues(projection[0], observableFct)
                    let paintingMesh = undefined

                    let contoursMesh = isoLines ? this.contoursMesh(obsValues, lut, min, max, linesCount, opacity) : undefined
                    let decoration = new Group()

                    decoration.add(...[paintingMesh, contoursMesh].filter(d => d))
                    
                    decoration.visible = activated && visible
                    decoration.name = this.mesh.name + "_shading"
                    decoration.userData = { ...this.mesh.userData, ...{ __fromMesh: this.mesh.name } }
                    return decoration
                })
            )

        }

        getProjections(column: string): { [key: string]: (any) => number } {

            let serie = this.mesh.dataframe.series[column]

            if (serie.itemSize == 1)
                return ShadingSkinConfiguration.projectionDict_1D

            if (serie.itemSize == 3)
                return ShadingSkinConfiguration.projectionDict_3D

            if (serie.itemSize == 6)
                return ShadingSkinConfiguration.projectionDict_6D
            return {}
        }


        contoursMesh(obsSerie, lut, minNormalized, maxNormalized, linesCount, opacity: number) {

            if (!(this.mesh.geometry instanceof BufferGeometry))
                throw Error("Only mesh using BufferGeometry can be used")
            
            let {min, max, values} = ModuleIsoContours.getIsoValues(obsSerie, minNormalized, maxNormalized, linesCount)
            let parameters = new IsoContoursParameters({
                filled: true,
                min:min,
                max:max,
                lut,
                opacity,
                isoList: values
            })
            let material =  new MeshStandardMaterial({ 
                color: 0xffffff, 
                vertexColors: true, 
                side:DoubleSide,            
                transparent: opacity != 1,
                opacity: opacity
             })
            let m = createIsoContours(
                this.mesh,
                obsSerie, {
                parameters,
                material
            })
            if(m==undefined)
                return undefined
            m.name = this.mesh.name + "_isoContours"
            m.userData.__fromMesh = this.mesh.name
            return m
        }

        getObsValues(column, observableFct) {
            return dfMap( this.mesh.dataframe.series[column], (d) => observableFct(d)) 
        }
    }


    export class MeshConfiguration {


        globalParameters$ = {
            visible$: new BehaviorSubject<boolean>(true),
            opacity$: new BehaviorSubject<number>(1)
        } 

        wireframe: WireframeConfiguration
        painting: PaintingConfiguration
        shading: ShadingSkinConfiguration

        mesh: Mesh

        decoration$: Observable<Object3D>

        constructor({ mesh }:
            {
                mesh: KeplerMesh
            }) {

            let material = mesh.material as MeshStandardMaterial
            let params = { 
                mesh, 
                color: '#' + material.color.getHexString(), 
                activated: false,
                globalParameters$ : this.globalParameters$ 
            }

            let wireframe = new WireframeConfiguration(params)            
            let painting =  new PaintingConfiguration(params)
            let shading = undefined    
            shading = new ShadingSkinConfiguration({mesh, activated: true,  globalParameters$ : this.globalParameters$ })

            this.wireframe = wireframe
            this.painting = painting
            this.shading = shading
            this.mesh = mesh
            let decorations$ = [this.wireframe.decoration$, this.painting.decoration$] as Array<Observable<Object3D>>
            this.shading && decorations$.push(this.shading.decoration$)

            this.decoration$ = combineLatest(decorations$).pipe(
                map(([wireframe, painting, shading]) => {
                    let group = new Group()
                    group.add(wireframe)
                    group.add(painting)
                    shading && group.add(shading)
                    group.name = this.mesh.name + "_viewer-skin-ctrls"
                    group.userData.__fromMesh = mesh.name
                    group.userData.classes = ["ViewerSkinCtrls"]
                    console.log("Decorations", {wireframe, painting, shading})
                    return group
                })
            )
        }

        clear(viewer: ModuleViewer.Module) {
            let ghost = new Object3D()
            ghost.name = this.mesh.name + "_viewer-skin-ctrls"
            viewer.render([ghost], new Context("", {}))
        }
    }



    /**
     * ## Persistent Data  🔧
     *
     *
     */
    @Schema({
        pack
    })
    export class PersistentData {

        constructor(){
        }
    }


    export let contract = expectAnyOf({
        description: "A KeplerMesh or a group of 3D objects containing KeplerMesh(es)",
        when: [
            expectInstanceOf({
                typeName: 'KeplerMesh',
                Type: KeplerMesh, attNames: ['object', 'mesh']
            }),
            expectAllOf({
                description: 'A group of 3D objects containing KeplerMesh',
                when: [
                    expectInstanceOf({ typeName: 'Group', Type: Group }),
                    expect({
                        description: 'The group contains KeplerMesh',
                        when: (group: Group) => group.children.find(child => child instanceof KeplerMesh) != undefined,
                        normalizeTo: (group: Group) => group.children.filter(child => child instanceof KeplerMesh)
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
        namespace: PluginLiveSkinController,
        id: "PluginLiveSkinController",
        displayName: "Skin Controller",
        description: "Controls for displaying attributes of kepler objects",
        resources: {
            'technical doc': `${pack.urlCDN}/dist/docs/modules/lib_live_skin_controller_plugin.pluginliveskincontroller.html`
        },
        compatibility: {
            "Parent module needs to be a flux-pack-3d-basics Viewer": (mdle) => mdle instanceof ModuleViewer.Module
            }
    })
    @BuilderView({
        namespace: PluginLiveSkinController,
        icon: svgIcon
    })
    export class Module extends PluginFlux<ModuleViewer.Module> {

        viewer: ModuleViewer.Module
        viewerDiv$: ReplaySubject<HTMLDivElement>
        subscriptions = new Array<Subscription>()

        selected$ = new BehaviorSubject<string>(undefined)
        pineds$ = new BehaviorSubject<Array<string>>([])
        visibles$ = new BehaviorSubject<Array<string>>([])

        meshes: { [key: string]: MeshConfiguration } = {}

        meshesId$ = new BehaviorSubject([])
        
        contexts : { [key: string]: any } = {}

        constructor(params) {
            super(params)
            this.viewer = this.parentModule
            this.viewerDiv$ = this.viewer.pluginsGateway.renderingDiv$

            this.addInput({
                id:"object", 
                description:"Kepler object input",
                contract,
                onTriggered: ({data,configuration, context}) =>  this.addMeshes(data, context)
            })
            this.selected$.pipe(
                skip(1) 
            ).subscribe( (selectedId) => {

                if(selectedId==undefined){
                    let ghost = new Object3D()
                    ghost.name = 'kepler_viewer_ctrl_selection'
                    this.viewer.render([ghost], new Context("",{}))
                    return
                }
                let object = this.meshes[selectedId].mesh
                const box = new BoxHelper(object, 0xffbb00);
                box.name = 'kepler_viewer_ctrl_selection'
                this.viewer.render([box], new Context("",{}))
            })
        }

        addMeshes(data: Array<KeplerMesh>, context: Context) {

            data.forEach( mesh => this.addMesh(mesh, context))
        }
        addMesh( mesh: KeplerMesh, context: Context) {

            
            this.meshes[mesh.name] = new MeshConfiguration({ mesh })
            this.meshesId$.next([...this.meshesId$.getValue().filter(id => id != mesh.name), mesh.name])
            this.meshes[mesh.name].decoration$.subscribe(mesh =>
                this.viewer.render([mesh], context)
                )
            this.contexts[mesh.name] = context
            //this.output$.next({data:{ type:'objectAdded', objectId:data.name }, context})
        }

        toggleVisible(name: string) : boolean {

            let base =  this.visibles$.getValue().filter( n => n!=name)
            let meshConfig = this.meshes[name]

            if(this.visibles$.getValue().includes(name)){
                this.visibles$.next( base )
                meshConfig.globalParameters$.visible$.next(false)
                if(!this.pineds$.getValue().includes(name))
                    this.togglePined(name)
                if( this.selected$.getValue() == name)
                    this.selected$.next(undefined)
                return false
            }
            this.visibles$.next( [...base, name] )
            meshConfig.globalParameters$.visible$.next(true)
            return true
        }

        togglePined(name: string) {

            let base =  this.pineds$.getValue().filter( n => n!=name)

            if(this.pineds$.getValue().includes(name) && this.visibles$.getValue().includes(name)){
                this.pineds$.next( base )
                return
            }
            if(!this.pineds$.getValue().includes(name))
                this.pineds$.next( [...base, name] )
        }

        mouseSubscription : Subscription 

        apply() {
            this.mouseSubscription = combineLatest([
                this.parentModule.pluginsGateway.mouseDown$,
                this.parentModule.pluginsGateway.renderingDiv$]
                ).pipe(
                map( ([event, div]: [MouseEvent, HTMLDivElement]) => {
                    let mouse       = new Vector2();
                    mouse.x         = ( event['layerX'] / div.querySelector("canvas").clientWidth ) * 2 - 1;
                    mouse.y         = - (event['layerY'] / div.querySelector("canvas").clientHeight ) * 2 + 1;
                    return mouse
                }),
                map( (mouse) => {
                    let raycaster   = new Raycaster();        
                    raycaster.setFromCamera( mouse,  this.parentModule.camera );
                    let meshes = Object.values(this.meshes).map( meshConf => meshConf.mesh)
                    return raycaster.intersectObjects( meshes, true );
                })
            ).subscribe((intersections) => {
                if(intersections.length==0)
                    return 
                let object = intersections[0].object
                this.selected$.next(object.name)
                if(!this.visibles$.getValue().includes(object.name))
                    this.toggleVisible(object.name)
            })
            
            this.viewerDiv$.subscribe(div => renderControls(this, div.parentElement as HTMLDivElement))
        }

        dispose() {
            this.mouseSubscription.unsubscribe()
            this.subscriptions.forEach(s => s.unsubscribe())
        }
    }


    function renderControls(mdle: Module, viewerDiv: HTMLDivElement) {

        viewerDiv.style.setProperty('position', 'relative')

        let input$ = combineLatest([
            mdle.selected$,
            mdle.pineds$
        ]).pipe(
            map( ([ selectedId, pineds]: [ string, Array<string>]) => {

                let buffer = [...pineds]
                if( selectedId && !buffer.includes(selectedId))
                    buffer.push(selectedId)
                let keplerObjects = buffer.map( id => mdle.meshes[id])
                return keplerObjects
            })
        )

        let panel = render({
            class: 'p-3 border rounded',
            style: { position: 'absolute', opacity:'0.85', left: '0%', top: '0%', 'font-size': 'small', 'max-height':'100%', 'overflow-y':'auto' },
            children: 
                childrenWithReplace$(
                    input$,
                    (keplerObject: MeshConfiguration) => {
                        return renderMeshGroup(mdle, keplerObject.mesh.name, mdle.selected$.getValue())
                    },
                    {}
                )
            /*[
                child$(
                     input$,
                     ([ selectedId, pineds]: [ string, Array<string>]) => {
                        let buffer = [...pineds]
                        if( selectedId && !buffer.includes(selectedId))
                            buffer.push(selectedId)
                        let children = buffer.map( keplerMeshId => {
                            return renderMeshGroup(mdle, keplerMeshId, selectedId)
                        })                            
                        return {children}
                    }
                )
            ]*/
        })
        viewerDiv.appendChild(panel)
    }

    
    class MeshGroupState extends ExpandableGroup.State {

        geometry: BufferGeometry
        displayName: string
        constructor(public readonly meshConfig: MeshConfiguration) {
            super(meshConfig.mesh.name)
            this.geometry = meshConfig.mesh.geometry as BufferGeometry
            this.displayName = meshConfig.mesh.userData.displayName || this.name
        }
    }

    function renderMeshGroup(mdle: Module,  keplerMeshId: string, selectedId: string) : VirtualDOM {

        let keplerObject = mdle.meshes[keplerMeshId]//.find( conf => conf.mesh.name == selected)

        Switch.View.defaultRadius = 10
        let contentView = (state: MeshGroupState) => {
            return {

                class: "p-2 rounded",
                children: [
                    {
                        children:[
                            sliderRow('opacity%', 0, 1, state.meshConfig.globalParameters$.opacity$),
                        ]
                    },
                    renderWireframeGroup('Wireframe', state.meshConfig.wireframe),
                    renderPaintingGroup('Material', state.meshConfig.painting),
                    renderShadingSkinGroup('Shader skin', state.meshConfig.shading)
                ]
            }
        }

        let classesBase = "d-flex align-items-center justify-content-between rounded px-2"
        let headerView = (state: MeshGroupState) => {
            return {
                class: state.name == selectedId 
                    ? classesBase + " fv-color-focus fv-pointer" 
                    : classesBase + " fv-color-primary fv-pointer",
                /*onclick: () => {
                    mdle.selected$.next( mdle.selected$.getValue() == state.name? undefined : state.name)
                    state.expanded$.next(!state.expanded$.getValue())
                },*/
                children: [
                    {
                        children: [
                            {   tag: 'i', 
                                class: attr$(
                                    state.expanded$,
                                    d => d ? "fas fa-caret-down" : "fas fa-caret-right" 
                                )
                            },
                            { 
                                tag: 'span', class: 'px-2', innerText: state.displayName        
                            }
                        ]
                    },
                    {   class:'float-right',
                        children:[
                            { 
                                tag: 'i', 
                                class:" fas fa-hand-point-up fas pl-2 ",
                                onclick: (ev: MouseEvent)=> { 
                                    
                                    mdle.selected$.getValue() == state.name
                                        ? mdle.selected$.next(undefined)
                                        : mdle.selected$.next(state.name)
                                    ev.stopPropagation()
                                }
                            },
                            { 
                                tag: 'i', 
                                class: attr$(
                                    mdle.visibles$,
                                    (visibles) => visibles.includes(state.name) ? "fas fa-eye fv-text-focus" : "fas fa-eye-slash",
                                    { wrapper: (d) => d + " fas fv-hover-text-focus pl-2 " }
                                ),
                                onclick: (ev: MouseEvent)=> { 
                                    mdle.toggleVisible(state.name) 
                                    ev.stopPropagation()
                                }
                            },
                            { 
                                tag: 'i', 
                                class: attr$(
                                    mdle.pineds$,
                                    (pineds) => pineds.includes(state.name) ? "fv-text-focus" : "",
                                    { wrapper: (d) => d + " fas fa-thumbtack fas pl-2 " }
                                ),
                                onclick: (ev: MouseEvent)=> { 
                                    mdle.togglePined(state.name) 
                                    ev.stopPropagation()
                                }
                            }
                        ]
                    }
                    
                ]
            }
        }
        return new ExpandableGroup.View({ 
            state: new MeshGroupState(keplerObject), 
            contentView, 
            headerView,
            class: 'fv-bg-background fv-text-primary p-2 border' 
            } as any
        )
    
    }


    function renderWireframeGroup(title: string, material: WireframeConfiguration) : VirtualDOM{

        let contentView = (state) => ({
            children: [
                colorRowView(material.color$),
                sliderRow('line-width', 0, 10, material.lineWidth$)
            ]
        })
        let headerView = (state) => headerGrpView(title, state.expanded$, material.activated$)

        return new ExpandableGroup.View({
            state: new ExpandableGroup.State(title),
            contentView, 
            headerView,
            class: 'fv-bg-background fv-text-primary' 
        } as any
        )
    }

    function renderPaintingGroup(title: string, material: PaintingConfiguration) : VirtualDOM{

        let contentView = (state) => ({
            children: [
                colorRowView(material.color$),
                sliderRow('metal%', 0, 1, material.metalness$),
                sliderRow('rough%', 0, 1, material.roughness$),
                switchRowView('flat shading', material.flatShading$)
            ]
        })
        let headerView = (state) => headerGrpView(title, state.expanded$, material.activated$)

        return new ExpandableGroup.View({
            state: new ExpandableGroup.State(title),
            contentView, 
            headerView, 
            class: 'fv-bg-background fv-text-primary' 
            } as any
        )
    }


    function renderShadingSkinGroup(title: string, config: ShadingSkinConfiguration, withChildren = {}) {


        let column$ = new BehaviorSubject<string>(Object.keys(config.mesh.dataframe.series)[0])

        let contentViewContours= (state) => ({
            children: [
                integerRow("count", config.linesCount$) 
            ]
        })
        let headerViewContours = (state) => headerGrpView('contours', state.expanded$, config.isoLines$) 

        let contoursPanel = new ExpandableGroup.View({            
            state: new ExpandableGroup.State('contours',true), 
            contentView: contentViewContours, 
            headerView:headerViewContours
        })
            
        let contentViewShading= (state) => ({
            children:[       
                selectRow('color scale', config.lut$, LookUpTables),
                selectRow('mode', config.paintingMode$,  config.paintingNames)
            ]
        })
        let headerViewShading = (state) => headerGrpView('shading', state.expanded$, config.shading$) 

        /*let shadingPanel = new ExpandableGroup.View({
            state: new ExpandableGroup.State('shading',true), 
            contentView: contentViewShading, 
            headerView:headerViewShading
        })*/

        let contentView = (state) => ({
            class:'px-1',  
            children:[
                {
                    class:'d-flex align-items-center',
                    children:[
                        selectRow('column', column$, Object.keys(config.mesh.dataframe.series)),
                        selectProjection( 
                            (column)=> Object.keys(config.getProjections(column)),
                            (column, selection) => config.getProjections(column)[selection],
                            column$, 
                            config.projection$),
                    ]
                },
                sliderRow('min%', 0, 1, config.min$),
                sliderRow('max%', 0, 1, config.max$),
                selectRow('color scale', config.lut$, LookUpTables),
                contoursPanel,
                //shadingPanel
            ]
        })
        let headerView = (state) => headerGrpView(title, state.expanded$, config.activated$)

        return new ExpandableGroup.View({
            state: new ExpandableGroup.State(title),
            contentView,
            headerView,
            class: 'fv-bg-background fv-text-primary' 
        } as any)
    }
}