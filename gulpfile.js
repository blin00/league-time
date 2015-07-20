'use strict';

var _ = require('lodash'),
    gulp = require('gulp'),
    browserify = require('browserify'),
    minifyCss = require('gulp-minify-css'),
    source = require('vinyl-source-stream'),
    uglify = require('gulp-uglify'),
    del = require('del'),
    gulpif = require('gulp-if'),
    size = require('gulp-size'),
    buffer = require('vinyl-buffer'),
    watchify = require('watchify'),
    jshint = require('gulp-jshint'),
    shell = require('gulp-shell');

var cssGlob = 'src/**/*.css';

function bf(watch) {
    function bundle() {
        return b.bundle()
            .on('error', function(err) {
                if (watch) {
                    console.error(err.message);
                    this.emit('end');
                } else throw err;
            })
            .pipe(source('index.js'))
            .pipe(gulpif(!watch, buffer()))
            .pipe(gulpif(!watch, uglify()))
            .pipe(gulpif(!watch, size({gzip: true})))
            .pipe(gulp.dest('public/js'));
    }
    var b = browserify('src/index.js', _.assign({
        noParse: ['d3'],
        fullPaths: false,
        debug: true,
    }, watch ? watchify.args : {debug: false}));
    if (watch) {
        b = watchify(b);
        b.on('update', bundle);
    }
    return bundle();
}

gulp.task('jshint', function() {
    return gulp.src(['*.js', 'src/**/*.js'])
        .pipe(jshint())
        .pipe(jshint.reporter('default'));
});

gulp.task('watch', ['default'], function() {
    gulp.watch(cssGlob, ['mincss']);
});

gulp.task('browserify', function() {
    return bf(false);
});

gulp.task('watchify', ['default'], function() {
    return bf(true);
});

gulp.task('copy', function() {
    return gulp.src(['node_modules/bootstrap/dist/css/bootstrap.min.css'])
        .pipe(gulp.dest('public/css'));
});

gulp.task('mincss', function() {
    return gulp.src(cssGlob)
        .pipe(minifyCss())
        .pipe(gulp.dest('public/css'));
});

gulp.task('clean', function(callback) {
    del(['public/css', 'public/js'], callback);
});

gulp.task('nodemon', function() {
    return gulp.src('', {read: false})
        .pipe(shell('nodemon'));
});

gulp.task('default', ['jshint', 'browserify', 'copy', 'mincss']);
gulp.task('live', ['default', 'watch', 'watchify', 'nodemon']);