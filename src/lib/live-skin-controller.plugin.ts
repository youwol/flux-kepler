import * as _ from 'lodash'
import {
    Context, BuilderView, Flux, Schema, ModuleFlux, Pipe, expect, expectInstanceOf, contract, ModuleError, expectAnyOf, expectAllOf, Property, PluginFlux
} from '@youwol/flux-core'

import { pack } from './main'
import { map as dfMap } from '@youwol/dataframe'
import { createFluxThreeObject3D, ModuleViewer } from '@youwol/flux-three'
import { BoxHelper, BufferGeometry, DoubleSide, Group, Intersection, Material, Mesh, MeshStandardMaterial, Object3D, Raycaster, Vector2 } from 'three'
import { KeplerMesh, LookUpTables, SkinConfiguration } from './models'
import { createIsoContours, IsoContoursParameters } from '@youwol/kepler'
import { BehaviorSubject, combineLatest, Observable, ReplaySubject, Subject, Subscription } from 'rxjs'
import { distinctUntilChanged, filter, map, tap, withLatestFrom } from 'rxjs/operators'
import { attr$, child$, render, VirtualDOM } from '@youwol/flux-view'
import { ExpandableGroup} from '@youwol/fv-group'
import { Switch} from '@youwol/fv-button'
import { Slider, TextInput, ColorPicker, Select} from '@youwol/fv-input'
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

    export class WireframeConfiguration {

        lineWidth$: BehaviorSubject<number>
        color$: BehaviorSubject<string>
        activated$: BehaviorSubject<boolean>

        decoration$: Observable<Mesh>

        mesh: Mesh

        constructor({ mesh, color, activated, lineWidth }: { mesh: Mesh, color: string, activated: boolean, lineWidth?: number }) {

            this.color$ = new BehaviorSubject<string>(color)
            this.activated$ = new BehaviorSubject<boolean>(activated)
            this.lineWidth$ = new BehaviorSubject<number>(lineWidth ? lineWidth : 1)
            this.mesh = mesh

            this.decoration$ = combineLatest([this.activated$, this.color$, this.lineWidth$]).pipe(
                map(([activated, color, lineWidth]) => {
                    let originalMat = mesh.material as MeshStandardMaterial
                    let mat = new MeshStandardMaterial(
                        {
                            color, wireframe: true, flatShading: originalMat.flatShading,
                            vertexColors: originalMat.vertexColors, side: DoubleSide, wireframeLinewidth: lineWidth
                        })
                    mat.visible = activated
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

        constructor({ mesh, color, flatShading, roughness, metalness, activated }:
            { mesh: Mesh, color: string, activated: boolean, flatShading?: boolean, roughness?: number, metalness?: number, }) {

            let originalMat = mesh.material as MeshStandardMaterial
            this.color$ = new BehaviorSubject<string>(color)
            this.activated$ = new BehaviorSubject<boolean>(activated)
            this.flatShading$ = new BehaviorSubject<boolean>(flatShading != undefined ? flatShading : originalMat.flatShading)
            this.roughness$ = new BehaviorSubject<number>(roughness != undefined ? roughness : originalMat.roughness)
            this.metalness$ = new BehaviorSubject<number>(metalness != undefined ? metalness : originalMat.metalness)
            this.mesh = mesh

            this.decoration$ = combineLatest([this.activated$, this.color$, this.flatShading$, this.roughness$, this.metalness$]).pipe(
                map(([activated, color, flatShading, roughness, metalness]) => {
                    let originalMat = mesh.material as MeshStandardMaterial
                    let mat = new MeshStandardMaterial(
                        { color, wireframe: false, flatShading: flatShading, roughness, metalness, vertexColors: originalMat.vertexColors, side: DoubleSide })
                    mat.visible = activated
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

        constructor({ mesh, lut, min, max, column, projection, linesCount, isoLines, shading, paintingMode, activated }:
            {
                mesh: KeplerMesh, lut?: string, min?: number, max?: number, column?: string,
                projection?: string, linesCount?: number, isoLines?: boolean, shading?: boolean,
                paintingMode?: string, activated: boolean,
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

            this.decoration$ = combineLatest([this.activated$, this.lut$, this.min$, this.max$, this.column$,
            this.projection$, this.linesCount$, this.isoLines$, this.shading$, this.paintingMode$]).pipe(
                map(([activated, lut, min, max, column, projection, linesCount, isoLines, shading, paintingMode]:
                    [boolean, string, number, number, string, [string, string, (any) => number], number, boolean, boolean, string]) => {

                    let observableFct = projection[2] // (data) => projection[2](data[projection[0]])
                    let obsValues = this.getObsValues(projection[0], observableFct)
                    let paintingMesh = undefined
                    /*let paintingMesh = shading
                        ? this.paintingMesh(paintingMode, obsValues, lut, min, max, linesCount)
                        : undefined
                    shading && paintingMesh && paintingMesh.material instanceof Material && (paintingMesh.material.flatShading = true)
                    */

                    let contoursMesh = isoLines ? this.contoursMesh(obsValues, lut, min, max, linesCount) : undefined
                    let decoration = new Group()

                    decoration.add(...[paintingMesh, contoursMesh].filter(d => d))
                    
                    decoration.visible = activated
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


        contoursMesh(obsSerie, lut, min, max, linesCount) {

            if (!(this.mesh.geometry instanceof BufferGeometry))
                throw Error("Only mesh using BufferGeometry can be used")

            let parameters = new IsoContoursParameters({
                filled: true,
                min,
                max,
                lut,
                nbr: linesCount
            })
            let material =  new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, side:DoubleSide })
            let m = createIsoContours(
                this.mesh,
                obsSerie, {
                parameters,
                material
            })
            m.name = this.mesh.name + "_isoContours"
            m.userData.__fromMesh = this.mesh.name
            return m
        }

        getObsValues(column, observableFct) {
            /*let cols = Object.keys(this.mesh.dataframe.series)
            let series = this.mesh.dataframe.series
            let zero = this.mesh.dataframe.columns().reduce((acc, e) => Object.assign({}, acc, { [e]: undefined }), {})

            return this.mesh.dataframe.index().map((i) => {
                let vars = _.clone(zero)
                cols.reduce((acc, e) => { acc[e] = series[e].values[i]; return acc }, vars)
                return observableFct(vars)
            })*/
            return dfMap( this.mesh.dataframe.series[column], (d) => observableFct(d)) 
        }
    }


    export class MeshConfiguration {

        wireframe: WireframeConfiguration
        painting: PaintingConfiguration
        shading: ShadingSkinConfiguration

        mesh: Mesh

        decoration$: Observable<Object3D>

        constructor({ mesh, wireframe, painting, shading }:
            {
                mesh: Mesh, wireframe: WireframeConfiguration,
                painting: PaintingConfiguration, shading?: ShadingSkinConfiguration
            }) {

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

        selected$ = new ReplaySubject<string>(1)
        //selected$ = new ReplaySubject<string>(1)

        deleted$ = new Subject<MeshConfiguration>()

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

            this.deleted$.pipe( 
                withLatestFrom(this.selected$),
            ).subscribe( ([deleted, selectedId]) => {
                this.removeObject(deleted, selectedId)
            })
        }

        addMeshes(data: Array<KeplerMesh>, context: Context) {

            data.forEach( mesh => this.addMesh(mesh, context))
        }
        addMesh(data: KeplerMesh, context: Context) {

            /*if (!(data instanceof Mesh)) {
                this.viewer.render(data, this.viewer.getConfiguration<any>(), context)
                if(data instanceof Object3D )
                    this.meshes[data.name] && this.meshes[data.name].clear(this.viewer) 
                this.meshesId$.next(this.meshesId$.getValue().filter(id => id != data.name))
                return
            }*/
            this.meshes[data.name] = getInitialMeshConfiguration(data)
            this.meshesId$.next([...this.meshesId$.getValue().filter(id => id != data.name), data.name])
            this.meshes[data.name].decoration$.subscribe(mesh =>
                this.viewer.render([mesh], context))
            this.contexts[data.name] = context
            //this.output$.next({data:{ type:'objectAdded', objectId:data.name }, context})
        }

        removeObject( meshConfig: MeshConfiguration , selectedId ){
            
            let objectId = meshConfig.mesh.name
            this.meshesId$.next(this.meshesId$.getValue().filter(id => id != objectId))
            meshConfig.clear(this.viewer)

            delete this.contexts[objectId]
            if(objectId==selectedId){
                let removeSelectionBox = new Object3D()
                removeSelectionBox.name = 'kepler_viewer_ctrl_selection'
                this.viewer.render([removeSelectionBox], new Context("",{}))  
            }
        }

        mouseSubscription : Subscription 

        apply() {
            this.mouseSubscription = combineLatest([
                this.parentModule.pluginsGateway.click$,
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

                let object = intersections[0].object
                const box = new BoxHelper(object, 0xffbb00);
                box.name = 'kepler_viewer_ctrl_selection'
                this.viewer.render([box], new Context("",{}))
                this.selected$.next(object.name)
            })
            
            this.viewerDiv$.subscribe(div => renderControls(this, div.parentElement as HTMLDivElement))
        }

        dispose() {
            this.mouseSubscription.unsubscribe()
            this.subscriptions.forEach(s => s.unsubscribe())
        }
    }


    function getInitialMeshConfiguration(mesh: KeplerMesh) {

        let material = mesh.material as MeshStandardMaterial

        let wireframe = material.wireframe
            ? new WireframeConfiguration({ mesh, color: '#' + material.color.getHexString(), activated: false })
            : new WireframeConfiguration({ mesh, color: '#' + material.color.getHexString(), activated: false })
        let painting = !material.wireframe
            ? new PaintingConfiguration({ mesh, color: '#' + material.color.getHexString(), activated: false })
            : new PaintingConfiguration({ mesh, color: '#' + material.color.getHexString(), activated: false })
        let shading = undefined
        
        shading = new ShadingSkinConfiguration({mesh, activated: true})

        return new MeshConfiguration({ mesh, wireframe, painting, shading })
    }


    function renderControls(mdle: Module, viewerDiv: HTMLDivElement) {

        viewerDiv.style.setProperty('position', 'relative')

        let input$ = combineLatest([mdle.meshesId$, mdle.selected$]).pipe(
            map(([meshIds, selected]) => [meshIds.map(id => mdle.meshes[id]), selected])
        )

        let panel = render({
            class: 'p-3 border rounded',
            style: { position: 'absolute', left: '0%', top: '0%', 'font-size': 'small', 'max-height':'100%', 'overflow-y':'auto' },
            children: [
                child$(
                     input$,
                     ([meshConfigs, selected]: [Array<MeshConfiguration>, string]) => {
                         if(selected == undefined)
                            return {}
                        let meshSelected = meshConfigs.find( conf => conf.mesh.name == selected)
                        // meshConfigs.map(meshConfig => renderMeshGroup(mdle, meshConfig, selected)
                        return renderMeshGroup(mdle, meshSelected, selected)
                    }
                )
            ]
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

    function renderMeshGroup(mdle: Module, meshConfig: MeshConfiguration, selectedId) : VirtualDOM {
        Switch.View.defaultRadius = 10
        let contentView = (state: MeshGroupState) => {
            return {

                class: "p-2 rounded",
                children: [
                    {
                        class: 'pb-1',
                        children: [
                            { innerText: `vertexes: ${state.geometry.getAttribute('position').count}` },
                            { innerText: `triangles: ${state.geometry.getIndex().count}` }
                        ]
                    },
                    renderWireframeGroup('Wireframe', state.meshConfig.wireframe),
                    renderPaintingGroup('Material', state.meshConfig.painting),
                    state.meshConfig.shading
                        ? renderShadingSkinGroup('Shader skin', state.meshConfig.shading)
                        : {}
                ]
            }
        }

        let classesBase = "d-flex align-items-center justify-content-between rounded px-2"
        let headerView = (state: MeshGroupState) => {
            return {
                class: state.name == selectedId 
                    ? classesBase + " fv-color-focus fv-pointer" 
                    : classesBase + " fv-color-primary fv-pointer",
                children: [
                    {
                        children: [
                            {   tag: 'i', 
                                class: attr$(
                                    state.expanded$,
                                    d => d ? "fas fa-caret-down" : "fas fa-caret-right" 
                                )
                            },
                            { tag: 'span', class: 'px-2', innerText: state.displayName }
                        ]
                    },
                    { 
                        tag: 'i', class: "fas fa-times float-right fv-hover-text-focus pl-2 fv-text-error", 
                        onclick: ()=> mdle.deleted$.next(meshConfig)
                    }
                ]
            }
        }
        return new ExpandableGroup.View({ 
            state: new MeshGroupState(meshConfig), 
            contentView, 
            headerView,
            class: 'fv-bg-background fv-text-primary p-2 border' 
            } as any
        )
    
    }

    function headerGrpView(title, expanded$, activated$) : VirtualDOM {

        let state = new Switch.State(activated$)
        let switchView = new Switch.View({ state, class: 'px-2' } as any)

        return {
            class: attr$( 
                activated$,
                (activated) =>  activated ? 'fv-text-focus' : '',
                {wrapper: (d) => d + ' d-flex align-items-center fv-pointer'}
            ),
            children: [
                {
                    tag: 'i',
                    class: attr$(
                        expanded$,
                        d => d ? "fas fa-caret-down" : "fas fa-caret-right"
                    )                        
                },
                {
                    tag: 'span',
                    class:  attr$(
                        activated$,
                        d => d ? 'px-1 fv-text-enabled' : 'px-1 fv-text-light'
                    ),
                    innerText: title
                },
                switchView,
            ]
        }
    }
    
    function colorRowView(color$)  : VirtualDOM {

        let colorTextState = new TextInput.State(color$)
        let colorTextView = new TextInput.View({
            state: colorTextState,
            class: 'mx-1',
            style: { width: '70px', 'text-align': 'center' } 
        }as any )
        let colorPickerState = new ColorPicker.State(color$)
        let colorPickerView = new ColorPicker.View({state:colorPickerState})

        return {
            class: "p-2 rounded d-flex align-items-center",
            children: [
                {
                    tag: 'span', class: 'px-1', innerText: 'color', style: colorTextState.value$.pipe(
                        map(c => ({ 'background-color': c }))
                    )
                },
                colorTextView,
                colorPickerView,
            ]
        }
    }
    function rowViewBase(title, vDom: VirtualDOM) : VirtualDOM{
        return {
            class: "p-2 rounded d-flex align-items-center fv-text-primary",
            children: [
                { tag: 'span', class: 'px-1', innerText: title },
                vDom
            ]
        }
    }
    function switchRowView(title, value$) : VirtualDOM {
        let state = new Switch.State(value$)
        let view = new Switch.View({state})
        return rowViewBase(title, view)
    }

    function sliderRow(title, min, max, value$) : VirtualDOM {
        let state = new Slider.State({min, max, value: value$, count:100})
        let view = new Slider.View({state})
        return rowViewBase(title, view)
    }

    function selectRow(title: string, selection$, names: string[]) : VirtualDOM {
        let state = new Select.State(
            names.map( name => new Select.ItemData(name,name)), 
            selection$
            )
        let view = new Select.View({state})
        return rowViewBase(title, view)
    }

    function integerRow(title, value$) : VirtualDOM {
        let state = new TextInput.State(value$)
        let view = new TextInput.View({state})
        return rowViewBase(title, view)
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

    function selectProjection(
        config:ShadingSkinConfiguration, 
        column$: BehaviorSubject<string>, 
        projection$: BehaviorSubject<[string, string, (any)=> number]>
        )  : VirtualDOM{

        let selection$ = new BehaviorSubject(projection$.getValue()[1])

        let projectionNames$ = column$.pipe(
            map(column => {
                let names = Object.keys(config.getProjections(column))
                console.log(names)
                return names
            }),
            tap( names => selection$.next(names[0]))
        )
        combineLatest([selection$,column$]).pipe(
            distinctUntilChanged( (a,b) => a[0] === b[0] &&  a[1] === b[1])
            )
        .subscribe( ([selection, column]) => {

            let fct = config.getProjections(column)[selection]
            if(fct){
                projection$.next([column, selection, fct]) 
            }
        })
        let state = new Select.State(
            projectionNames$.pipe( map(names => names.map( name => new Select.ItemData(name,name)))), 
            selection$)
        let view = new Select.View({state})
        return rowViewBase("projections", view)
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

        let shadingPanel = new ExpandableGroup.View({
            state: new ExpandableGroup.State('shading',true), 
            contentView: contentViewShading, 
            headerView:headerViewShading
        })

        let contentView = (state) => ({
            class:'px-1',  
            children:[
                {
                    class:'d-flex align-items-center',
                    children:[
                        selectRow('column', column$, Object.keys(config.mesh.dataframe.series)),
                        selectProjection(config, column$, config.projection$),
                    ]
                },
                sliderRow('min%', 0, 1, config.min$),
                sliderRow('max%', 0, 1, config.max$),
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