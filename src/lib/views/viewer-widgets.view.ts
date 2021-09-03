import * as _ from 'lodash'
import { distinctUntilChanged, map, tap} from 'rxjs/operators'
import { VirtualDOM } from '@youwol/flux-view'
import { Select } from '@youwol/fv-input'
import { BehaviorSubject, combineLatest } from 'rxjs'
import { rowViewBase } from '@youwol/flux-three'


export function selectProjection(
    getNames:   ( column) => string[],
    getProjections: ( column, selection) => (unknown) => number,
    //config:ShadingSkinConfiguration, 
    column$: BehaviorSubject<string>, 
    projection$: BehaviorSubject<[string, string, (any)=> number]>
    )  : VirtualDOM{

    let selection$ = new BehaviorSubject(projection$.getValue()[1])

    let projectionNames$ = column$.pipe(
        map(column => {
            let names = getNames(column) 
            return names
        }),
        tap( names => selection$.next(names[0]))
    )
    combineLatest([selection$,column$]).pipe(
        distinctUntilChanged( (a,b) => a[0] === b[0] &&  a[1] === b[1])
        )
    .subscribe( ([selection, column]) => {

        let fct = getProjections(column, selection) //config.getProjections(column)[selection]
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