import * as _ from 'lodash'
import { distinctUntilChanged, map, tap} from 'rxjs/operators'
import { attr$, VirtualDOM } from '@youwol/flux-view'
import { ExpandableGroup } from '@youwol/fv-group'
import { Switch } from '@youwol/fv-button'
import { Slider, TextInput, ColorPicker, Select } from '@youwol/fv-input'
import { BehaviorSubject, combineLatest } from 'rxjs'


export function headerGrpView(title, expanded$, activated$): VirtualDOM {

    let state = new Switch.State(activated$)
    let switchView = new Switch.View({ state, class: 'px-2' } as any)

    return {
        class: attr$(
            activated$,
            (activated) => activated ? 'fv-text-focus' : '',
            { wrapper: (d) => d + ' d-flex align-items-center fv-pointer' }
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
                class: attr$(
                    activated$,
                    d => d ? 'px-1 fv-text-enabled' : 'px-1 fv-text-light'
                ),
                innerText: title
            },
            switchView,
        ]
    }
}

export function colorRowView(color$): VirtualDOM {

    let colorTextState = new TextInput.State(color$)
    let colorTextView = new TextInput.View({
        state: colorTextState,
        class: 'mx-1',
        style: { width: '70px', 'text-align': 'center' }
    } as any)
    let colorPickerState = new ColorPicker.State(color$)
    let colorPickerView = new ColorPicker.View({ state: colorPickerState })

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


export function rowViewBase(title, vDom: VirtualDOM): VirtualDOM {
    return {
        class: "p-2 rounded d-flex align-items-center fv-text-primary",
        children: [
            { tag: 'span', class: 'px-1', innerText: title },
            vDom
        ]
    }
}


export function switchRowView(title, value$): VirtualDOM {
    let state = new Switch.State(value$)
    let view = new Switch.View({ state })
    return rowViewBase(title, view)
}


export function sliderRow(title, min, max, value$): VirtualDOM {
    let state = new Slider.State({ min, max, value: value$, count: 100 })
    let view = new Slider.View({ state })
    return rowViewBase(title, view)
}


export function selectRow(title: string, selection$, names: string[]): VirtualDOM {
    let state = new Select.State(
        names.map(name => new Select.ItemData(name, name)),
        selection$
    )
    let view = new Select.View({ state })
    return rowViewBase(title, view)
}

export function integerRow(title, value$): VirtualDOM {
    let state = new TextInput.State(value$)
    let view = new TextInput.View({ state })
    return rowViewBase(title, view)
}


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
            let names = getNames(column) //Object.keys(config.getProjections(column))
            console.log(names)
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