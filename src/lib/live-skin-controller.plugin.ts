import * as _ from 'lodash'
import {BuilderView, Flux, Schema} from '@youwol/flux-core'

import { pack } from './main'
import { map as dfMap } from '@youwol/dataframe'
import { ModuleViewer } from '@youwol/flux-three'
import { BufferGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial } from 'three'
import { KeplerMesh, LookUpTables} from './models'
import { createIsoContours, IsoContoursParameters } from '@youwol/kepler'
import { BehaviorSubject, combineLatest, Observable } from 'rxjs'
import { map, } from 'rxjs/operators'
import { ExpandableGroup} from '@youwol/fv-group'
import { ModuleIsoContours } from './iso-contours.module'
import {PluginLiveSkin as LiveSkinBase, sliderRow, selectRow, headerGrpView, 
    integerRow} from '@youwol/flux-three'
import { selectProjection } from './views/viewer-widgets.view'
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


    export class ShadingSkin extends LiveSkinBase.Skin<KeplerMesh>{

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

        parameters(){
            return {
                color: this.lut$.getValue(),
                min: this.min$.getValue(),
                max: this.max$.getValue(),
                column: this.column$.getValue(),
                projection: this.projection$.getValue(),
                linesCount: this.linesCount$.getValue(),
                isoLines: this.isoLines$.getValue(),
                shading: this.shading$.getValue(),
                paintingMode: this.paintingMode$.getValue(),
                activated: this.activated$.getValue()                
            }
        }

        constructor(
            body: KeplerMesh,
            { lut, min, max, column, projection, linesCount, isoLines, shading, 
            paintingMode, activated, globalParameters$ }:
            { 
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
                globalParameters$: LiveSkinBase.GlobalParams
            }) {
            super(body)
            this.lut$ = new BehaviorSubject<string>(lut != undefined ? lut : this.lutNames[0])
            this.activated$ = new BehaviorSubject<boolean>(activated)
            this.min$ = new BehaviorSubject<number>(min != undefined ? min : 0)
            this.max$ = new BehaviorSubject<number>(max != undefined ? max : 1)

            column = column != undefined ? column : Object.keys(body.dataframe.series)[0]
            this.column$ = new BehaviorSubject<string>(column)
            this.linesCount$ = new BehaviorSubject<number>(linesCount != undefined ? linesCount : 25)
            this.isoLines$ = new BehaviorSubject<boolean>(isoLines != undefined ? isoLines : true)
            this.shading$ = new BehaviorSubject<boolean>(shading != undefined ? shading : true)
            this.paintingMode$ = new BehaviorSubject<string>(paintingMode != undefined ? paintingMode : "step")
            //this.observableFct$ = new BehaviorSubject<(any) => number>(observableFct != undefined ? observableFct : (d) => d)


            let defaultProjection = Object.entries(this.getProjections(column))[0]
            this.projection$ = new BehaviorSubject<[string, string, (any) => number]>([column, ...defaultProjection])

            this.object3D$ = combineLatest([
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
                    decoration.name = this.body.name + "_shading"
                    decoration.userData = { ...this.body.userData, ...{ __fromMesh: this.body.name } }
                    return decoration
                })
            )

        }

        getProjections(column: string): { [key: string]: (any) => number } {

            let serie = this.body.dataframe.series[column]

            if (serie.itemSize == 1)
                return ShadingSkin.projectionDict_1D

            if (serie.itemSize == 3)
                return ShadingSkin.projectionDict_3D

            if (serie.itemSize == 6)
                return ShadingSkin.projectionDict_6D
            return {}
        }


        contoursMesh(obsSerie, lut, minNormalized, maxNormalized, linesCount, opacity: number) {

            if (!(this.body.geometry instanceof BufferGeometry))
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
                this.body,
                obsSerie, {
                parameters,
                material
            })
            if(m==undefined)
                return undefined
            m.name = this.body.name + "_isoContours"
            m.userData.__fromMesh = this.body.name
            return m
        }

        getObsValues(column, observableFct) {
            return dfMap( this.body.dataframe.series[column], (d) => observableFct(d)) 
        }
    }

    /**
     * ## Persistent Data  🔧
     *
     */
    @Schema({
        pack
    })
    export class PersistentData {

        constructor(){
        }
    }


    let skinsFactory : LiveSkinBase.SkinFactory[] = [
        LiveSkinBase.wireframeSkinFactory( (body) => ({activated:false}) ),
        LiveSkinBase.paintingSkinFactory( (body) => ({activated:false}) ),   
        {
            Type: ShadingSkin,
            defaultParameters: (_: Mesh) => ({activated: true}),
            view: (skin: ShadingSkin ) => renderShadingSkinGroup('Shading', skin)
        }     
    ]
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
        icon: LiveSkinBase.svgIcon
    })
    export class Module extends LiveSkinBase.Module {

        constructor(params) {
            super({
                ...params, 
                skinsFactory, 
                contract: LiveSkinBase.getContractForTypedObject3D<KeplerMesh>(KeplerMesh, "KeplerMesh") 
            } )
        }
    }

    function renderShadingSkinGroup(title: string, skin: ShadingSkin, withChildren = {}) {


        let column$ = new BehaviorSubject<string>(Object.keys(skin.body.dataframe.series)[0])

        let contentViewContours= (state) => ({
            children: [
                integerRow("count", skin.linesCount$) 
            ]
        })
        let headerViewContours = (state) => headerGrpView('contours', state.expanded$, skin.isoLines$) 

        let contoursPanel = new ExpandableGroup.View({            
            state: new ExpandableGroup.State('contours',true), 
            contentView: contentViewContours, 
            headerView:headerViewContours
        })
            
        let contentView = (state) => ({
            class:'px-1',  
            children:[
                {
                    class:'d-flex align-items-center',
                    children:[
                        selectRow('column', column$, Object.keys(skin.body.dataframe.series)),
                        selectProjection( 
                            (column)=> Object.keys(skin.getProjections(column)),
                            (column, selection) => skin.getProjections(column)[selection],
                            column$, 
                            skin.projection$),
                    ]
                },
                sliderRow('min%', 0, 1, skin.min$),
                sliderRow('max%', 0, 1, skin.max$),
                selectRow('color scale', skin.lut$, LookUpTables),
                contoursPanel,
                //shadingPanel
            ]
        })
        let headerView = (state) => headerGrpView(title, state.expanded$, skin.activated$)

        return new ExpandableGroup.View({
            state: new ExpandableGroup.State(title),
            contentView,
            headerView,
            class: 'fv-bg-background fv-text-primary' 
        } as any)
    }
}