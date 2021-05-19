/**
 * @author daron1337 / http://daron1337.github.io/
 * @author fmaerten  / https://github.com/xaliphostes
 */

import { Color } from "three"

/**
 * @category Color Lookup Table
 */
export class ColorMap {
    private map: any = []
    private lut: Array<Color> = []
    private n = 256
    private minV = 0
    private maxV = 1

    constructor(colormap: string, numberofcolors: number) {
        this.setColorMap(colormap, numberofcolors)
    }

    set(value: any) {
        if (value instanceof ColorMap) {
            this.copy(value)
        }
        return this
    }

    setMin(min: number) {
        this.minV = min
        return this
    }

    setMax(max: number) {
        this.maxV = max
        return this
    }

    setColorMap(colormap: any, numberofcolors: any) {
        this.map = ColorMapKeywords[ colormap ] || ColorMapKeywords.Rainbow
        this.n = numberofcolors || 32
        let step = 1.0 / this.n

        this.lut.length = 0

        for (let i = 0; i <= 1; i += step) {
            for (let j = 0; j < this.map.length - 1; j++) {
                if (i >= this.map[ j ][ 0 ] && i < this.map[ j + 1 ][ 0 ]) {
                let min = this.map[ j ][ 0 ]
                let max = this.map[ j + 1 ][ 0 ]
                let minColor = new Color(this.map[ j ][ 1 ])
                let maxColor = new Color(this.map[ j + 1 ][ 1 ])
                let color = minColor.lerp(maxColor, (i - min) / (max - min))
                this.lut.push(color)
                }
            }
        }

        return this
    }

    copy(lut: any) {
        this.lut = lut.lut
        this.map = lut.map
        this.n = lut.n
        this.minV = lut.minV
        this.maxV = lut.maxV
        return this
    }

    getColor(alpha: number) {
        if (alpha <= this.minV) {
            alpha = this.minV
        } else if (alpha >= this.maxV) {
            alpha = this.maxV
        }

        alpha = (alpha - this.minV) / (this.maxV - this.minV)
        let colorPosition = Math.round(alpha * this.n)

        if (colorPosition === this.n) colorPosition -= 1

        return this.lut[ colorPosition ]
    }

    addColorMap(colormapName: string, arrayOfColors: number) {
        ColorMapKeywords[ colormapName ] = arrayOfColors
    }

    createCanvas() {
        const canvas = document.createElement('canvas')
        canvas.width = 1
        canvas.height = this.n
        this.updateCanvas(canvas)
        return canvas
    }

    updateCanvas(canvas: any) {
        let ctx = canvas.getContext('2d', { alpha: false })
        let imageData = ctx.getImageData(0, 0, 1, this.n)
        let data = imageData.data
        let k = 0
        let step = 1.0 / this.n
        for (let i = 1; i >= 0; i -= step) {
            for (let j = this.map.length - 1; j >= 0; j--) {
                if (i < this.map[ j ][ 0 ] && i >= this.map[ j - 1 ][ 0 ]) {
                    let min = this.map[ j - 1 ][ 0 ]
                    let max = this.map[ j ][ 0 ]
                    let minColor = new Color(this.map[ j - 1 ][ 1 ])
                    let maxColor = new Color(this.map[ j ][ 1 ])
                    let color = minColor.lerp(maxColor, (i - min) / (max - min))
                    data[ k * 4 ] = Math.round(color.r * 255)
                    data[ k * 4 + 1 ] = Math.round(color.g * 255)
                    data[ k * 4 + 2 ] = Math.round(color.b * 255)
                    data[ k * 4 + 3 ] = 255
                    k += 1
                }
            }
        }
        ctx.putImageData(imageData, 0, 0)
        return canvas
    }
}
 
let ColorMapKeywords = {
     'Cooltowarm': [
         [ 0.0, 0x3C4EC2 ], 
         [ 0.2, 0x9BBCFF ], 
         [ 0.5, 0xDCDCDC ], 
         [ 0.8, 0xF6A385 ], 
         [ 1.0, 0xB40426 ]
     ],
 
     'Blackbody': [
         [ 0.0, 0x000000 ], 
         [ 0.2, 0x780000 ], 
         [ 0.5, 0xE63200 ], 
         [ 0.8, 0xFFFF00 ], 
         [ 1.0, 0xFFFFFF ]
     ],
 
     'Grayscale': [
         [ 0.0, 0x000000 ], 
         [ 0.2, 0x404040 ], 
         [ 0.5, 0x7F7F80 ], 
         [ 0.8, 0xBFBFBF ], 
         [ 1.0, 0xFFFFFF ]
     ],
 
     'Insar': [
         [0.0, 0x0500d5],
         [0.3, 0x00baff],
         [0.5, 0x00ffc6],
         [0.7, 0xfcff00],
         [1.0, 0xd00000]
     ],
 
     'Rainbow': [
         [0.0, 0xff0000],
         [0.2, 0xfffc00],
         [0.4, 0x00ff06],
         [0.6, 0x00fffc],
         [0.8, 0x0600ff],
         [1.0, 0xf600ff]
     ],
 
     'Igeoss': [
         [0.00, 0x004211],
         [0.25, 0xfffc00],
         [0.50, 0xffb400],
         [0.75, 0xff5a00],
         [1.00, 0x870000]
     ],
 
     'Blue_White_Red': [
         [0.0, 0x0012ff],
         [0.5, 0xffffff],
         [1.0, 0xff0000]
     ],
 
     'Blue_Green_Red': [
         [0.0 , 0x0012ff],
         [0.25, 0xffffff],
         [0.5 , 0x00ff00],
         [0.275, 0xffffff],
         [1.0 , 0xff0000]
     ],
 
     'Spectrum': [
         [0.0000, 0xffffff],
         [0.1428, 0xff0000],
         [0.2856, 0xff00fc],
         [0.4284, 0x0600ff],
         [0.5712, 0x00f6ff],
         [0.7140, 0x00ff06],
         [0.8568, 0xfffc00],
         [1.0000, 0xff0000]
     ],
 
     'Default': [
         [0.00, 0x0c00ff],
         [0.25, 0x00fcff],
         [0.50, 0x00ff0c],
         [0.75, 0xf6ff00],
         [1.00, 0xff0000]
     ],
 
     'Banded': [
         [0.0000, 0xfff5cd],
         [0.1666, 0xff9600],
         [0.1667, 0xceffd1],
         [0.3333, 0x107100],
         [0.3334, 0xd4e4fb],
         [0.5000, 0x015faf],
         [0.5001, 0xebdefb],
         [0.6666, 0xc5029e],
         [0.6667, 0xfff0cb],
         [0.8333, 0x845d00],
         [0.8334, 0xf9d8d8],
         [1.0000, 0xda0000]
     ],

}
 
// const lutTables = [
//     'Cooltowarm',
//     'Blackbody',
//     'Grayscale',
//     'Blue_Green_Red',
//     'Insar',
//     'Rainbow',
//     'Igeoss',
//     'Blue_White_Red',
//     'Spectrum',
//     'Default',
//     'Banded'
// ]
